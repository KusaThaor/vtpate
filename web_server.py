"""
Máy chủ Web cục bộ (Flask) cung cấp giao diện Web hiện đại cho VTPATE Crawler & EPUB Creator.
Hỗ trợ Real-time SSE Log Streaming, RESTful API đầy đủ cho việc cào truyện, quản lý checkpoint,
xử lý file EPUB lạ, và cấu hình bộ bóc tách tùy biến (WebToEpub style).
"""

import os
import sys
import time
import json
import queue
import threading
import subprocess
from datetime import datetime
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse

# Đảm bảo đường dẫn module
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from flask import Flask, request, jsonify, render_template, send_from_directory, Response

from vtpate.config import BASE_URL, AUTH_CONFIG, TIMING, CRAWL_ENGINES, SPLIT_OPTIONS, CHECKPOINT_DIR
from vtpate.browser import BrowserManager, HumanBehavior
from vtpate.checkpoint import CheckpointManager
from vtpate.epub_builder import EpubBuilder
from vtpate.crawler import StoryCrawler
from vtpate.site_parser import SiteParserManager, SiteParserConfig
from vtpate.format_processor import ContentFormatCleaner, EpubFileCleaner


# =========================================================================
# QUẢN LÝ NHẬT KÝ THỜI GIAN THỰC (REAL-TIME SSE LOG MANAGER)
# =========================================================================

class WebLogManager:
    """Quản lý nhật ký tập trung và phân phối SSE (Server-Sent Events) tới trình duyệt."""

    def __init__(self, max_history: int = 1500):
        self.max_history = max_history
        self.logs: List[Dict[str, Any]] = []
        self.subscribers: List[queue.Queue] = []
        self.lock = threading.Lock()
        self.counter = 0

        # Lưu stdout ban đầu
        self.orig_stdout = sys.stdout
        self.orig_stderr = sys.stderr

    def log(self, text: Any, log_type: str = "info"):
        """Ghi log và gửi ngay lập tức tới các client đang kết nối."""
        if not text:
            return

        if isinstance(text, bytes):
            try:
                text = text.decode("utf-8", errors="replace")
            except Exception:
                text = str(text)
        elif not isinstance(text, str):
            text = str(text)

        lines = text.splitlines()
        with self.lock:
            for line in lines:
                clean_line = str(line).strip()
                if not clean_line:
                    continue

                # Nhận diện loại log
                t = log_type
                low = clean_line.lower()
                if any(k in clean_line for k in ["Chương ", "chuong-", "chapter-", "Chương"]):
                    t = "chapter"
                elif any(k in low for k in ["lỗi", "error", "thất bại", "failed", "❌", "🚨"]):
                    t = "error"
                elif any(k in low for k in ["cảnh báo", "warning", "⚠️"]):
                    t = "warn"
                elif any(k in low for k in ["thành công", "hoàn thành", "success", "✅", "🎉"]):
                    t = "success"
                elif any(k in low for k in ["tạm dừng", "pause", "⏸️"]):
                    t = "pause"
                elif any(k in low for k in ["tiếp tục", "resume", "▶️"]):
                    t = "resume"
                elif any(k in low for k in ["cleaner", "làm sạch", "🧹", "pass"]):
                    t = "cleaner"

                self.counter += 1
                entry = {
                    "id": self.counter,
                    "time": datetime.now().strftime("%H:%M:%S"),
                    "type": t,
                    "text": clean_line
                }
                self.logs.append(entry)
                if len(self.logs) > self.max_history:
                    self.logs.pop(0)

                # Bắn tới mọi SSE client
                dead_subs = []
                for q in self.subscribers:
                    try:
                        q.put_nowait(entry)
                    except Exception:
                        dead_subs.append(q)
                for q in dead_subs:
                    if q in self.subscribers:
                        self.subscribers.remove(q)

    def subscribe(self) -> queue.Queue:
        q = queue.Queue(maxsize=300)
        with self.lock:
            self.subscribers.append(q)
        return q

    def unsubscribe(self, q: queue.Queue):
        with self.lock:
            if q in self.subscribers:
                self.subscribers.remove(q)

    def get_recent(self, count: int = 100) -> List[Dict[str, Any]]:
        with self.lock:
            return list(self.logs[-count:])

    def clear(self):
        with self.lock:
            self.logs.clear()


class WebLogRedirector:
    """Chuyển hướng sys.stdout / sys.stderr vào WebLogManager một cách an toàn và tương thích 100% với click/flask."""
    def __init__(self, log_manager: WebLogManager, is_err: bool = False):
        self.log_manager = log_manager
        self.is_err = is_err
        self.orig = sys.stderr if is_err else sys.stdout

    @property
    def encoding(self):
        return getattr(self.orig, "encoding", "utf-8") or "utf-8"

    @property
    def errors(self):
        return getattr(self.orig, "errors", "replace") or "replace"

    def isatty(self):
        try:
            return self.orig.isatty()
        except Exception:
            return False

    def write(self, text):
        if text is None:
            return 0

        # 1. Chuyển đổi text thành str an toàn nếu là bytes
        if isinstance(text, bytes):
            try:
                text_str = text.decode("utf-8", errors="replace")
            except Exception:
                text_str = str(text)
        else:
            text_str = str(text)

        # 2. Ghi ra console gốc
        try:
            if isinstance(text, bytes):
                if hasattr(self.orig, "buffer") and self.orig.buffer:
                    self.orig.buffer.write(text)
                    self.orig.buffer.flush()
                else:
                    self.orig.write(text_str)
                    self.orig.flush()
            else:
                self.orig.write(text_str)
                self.orig.flush()
        except Exception:
            pass

        # 3. Ghi vào WebLogManager
        try:
            self.log_manager.log(text_str, log_type="error" if self.is_err else "info")
        except Exception:
            pass

        return len(text)

    def flush(self):
        try:
            self.orig.flush()
        except Exception:
            pass

    def __getattr__(self, name):
        return getattr(self.orig, name)


# =========================================================================
# KHỞI TẠO CONTROLLER & FLASK APP
# =========================================================================

template_folder = os.path.join(current_dir, "templates")
static_folder = os.path.join(current_dir, "static")
os.makedirs(template_folder, exist_ok=True)
os.makedirs(static_folder, exist_ok=True)

app = Flask(
    __name__,
    template_folder=template_folder,
    static_folder=static_folder
)
app.config["MAX_CONTENT_LENGTH"] = 250 * 1024 * 1024  # 250MB upload

log_manager = WebLogManager()
sys.stdout = WebLogRedirector(log_manager, is_err=False)
sys.stderr = WebLogRedirector(log_manager, is_err=True)


class WebCrawlerController:
    """Quản lý crawler và trạng thái ứng dụng cho Web UI."""

    def __init__(self):
        self.browser_manager = BrowserManager()
        self.human = HumanBehavior()
        self.checkpoint_manager = CheckpointManager()
        self.epub_builder = EpubBuilder()
        self.site_parser_manager = SiteParserManager()
        self.crawler = StoryCrawler(
            browser_manager=self.browser_manager,
            human=self.human,
            checkpoint_manager=self.checkpoint_manager,
            epub_builder=self.epub_builder,
            base_url=BASE_URL,
            parser_manager=self.site_parser_manager
        )

        # Trạng thái cào truyện
        self.is_crawling = False
        self.is_paused = False
        self.stop_requested = False
        self.current_slug = ""
        self.current_story_name = ""
        self.status_text = "Sẵn sàng"
        self.current_chapter = 0
        self.total_chapters = 0
        self.crawler_thread: Optional[threading.Thread] = None
        self.last_results: List[str] = []

    def get_status_dict(self) -> Dict[str, Any]:
        """Tóm tắt trạng thái thời gian thực."""
        is_paused = False
        if hasattr(self.human, "pause_controller") and self.human.pause_controller:
            is_paused = self.human.pause_controller.is_paused

        percent = 0.0
        if self.total_chapters > 0:
            percent = round((self.current_chapter / self.total_chapters) * 100, 1)

        return {
            "is_crawling": self.is_crawling,
            "is_paused": is_paused,
            "current_slug": self.current_slug,
            "current_story_name": self.current_story_name,
            "status_text": self.status_text,
            "current_chapter": self.current_chapter,
            "total_chapters": self.total_chapters,
            "percent": percent,
            "auth_logged_in": self.browser_manager.is_logged_in() if self.browser_manager.is_driver_alive() else False,
            "auth_email": AUTH_CONFIG.get("email", ""),
            "last_results": self.last_results,
            "failed_chapters": getattr(self.crawler, 'failed_chapters', [])
        }

    def start_crawl(
        self,
        raw_url_or_slug: str,
        mode: str = "1",
        custom_chap: int = 5,
        session_limit: Optional[int] = None,
        split_size: int = 0,
        engine: str = "human",
        fast_delay: float = 0.8,
        concurrency: int = 3,
        range_start: Optional[int] = None,
        range_end: Optional[int] = None,
        reverse_order: bool = False,
        override_title: Optional[str] = None,
        override_author: Optional[str] = None,
        override_summary: Optional[str] = None,
        override_cover: Optional[str] = None,
        custom_classes: str = ""
    ) -> Dict[str, Any]:
        """Bắt đầu cào truyện trong luồng nền."""
        if self.is_crawling:
            return {"success": False, "message": "Tiến trình cào truyện đang chạy!"}

        slug = self.crawler.extract_slug(raw_url_or_slug)
        if not slug:
            return {"success": False, "message": "Không nhận diện được slug hoặc URL hợp lệ!"}

        story_url = raw_url_or_slug if raw_url_or_slug.startswith("http") else f"{BASE_URL.rstrip('/')}/stories/{slug}/"

        self.is_crawling = True
        self.is_paused = False
        self.stop_requested = False
        self.current_slug = slug
        self.current_story_name = slug
        self.status_text = f"Đang chuẩn bị cào: {slug}"
        self.current_chapter = 0
        self.total_chapters = 0
        self.last_results = []

        if hasattr(self.crawler, 'stop_requested'):
            self.crawler.stop_requested = False
        if hasattr(self.human, "pause_controller") and self.human.pause_controller:
            self.human.pause_controller.stop_requested = False
            self.human.pause_controller.is_paused = False

        # Class tùy biến cần xóa
        self.crawler.custom_classes_to_remove = custom_classes.strip() if custom_classes.strip() else None

        def _worker():
            try:
                log_manager.log(f"\n🚀 [Bắt Đầu Cào] Truyện: {slug} | Engine: {engine} | Concurrency: {concurrency}", "success")
                files = self.crawler.crawl_story(
                    story_url=story_url,
                    slug=slug,
                    global_mode=mode,
                    global_custom_chap=custom_chap,
                    split_size=split_size,
                    session_limit=session_limit,
                    crawl_engine=engine,
                    fast_delay=fast_delay,
                    concurrency=concurrency,
                    range_start=range_start,
                    range_end=range_end,
                    reverse_order=reverse_order,
                    override_title=override_title,
                    override_author=override_author,
                    override_summary=override_summary,
                    override_cover=override_cover,
                    auto_resume=True
                )
                self.last_results = files or []
                if files:
                    self.status_text = f"Hoàn thành! Đã tạo {len(files)} file EPUB."
                    log_manager.log(f"🎉 Hoàn thành xuất sắc: Đã tạo {len(files)} file EPUB!", "success")
                elif self.stop_requested or getattr(self.crawler, 'stop_requested', False):
                    self.status_text = "Đã dừng và chốt checkpoint an toàn."
                    log_manager.log("⏹️ Tiến trình cào đã dừng. Checkpoint đã được bảo toàn an toàn.", "warn")
                else:
                    self.status_text = "Đã kết thúc phiên cào."
            except Exception as e:
                self.status_text = f"Lỗi: {e}"
                log_manager.log(f"❌ Lỗi tiến trình cào: {e}", "error")
                import traceback
                traceback.print_exc()
            finally:
                self.is_crawling = False
                self.is_paused = False

        self.crawler_thread = threading.Thread(target=_worker, daemon=True)
        self.crawler_thread.start()
        return {"success": True, "message": f"Đã bắt đầu cào: {slug}"}

    def retry_failed_chapters(self) -> Dict[str, Any]:
        """Tải lại các chương bị lỗi từ phiên trước và đóng gói lại EPUB."""
        if self.is_crawling:
            return {"success": False, "message": "Tiến trình cào truyện đang chạy!"}

        if not getattr(self.crawler, 'failed_chapters', []):
            return {"success": False, "message": "Không có chương lỗi nào cần tải lại!"}

        slug = self.current_slug
        if not slug:
            return {"success": False, "message": "Không xác định được slug truyện hiện tại!"}

        checkpoint = self.checkpoint_manager.load(slug)
        if not checkpoint:
            return {"success": False, "message": f"Không tìm thấy checkpoint của truyện '{slug}'!"}

        self.is_crawling = True
        self.status_text = f"Đang tải lại {len(self.crawler.failed_chapters)} chương lỗi..."

        def _retry_worker():
            try:
                log_manager.log(f"\n🔄 [Tải Lại Lỗi] Đang thử tải lại {len(self.crawler.failed_chapters)} chương lỗi...", "info")
                name = checkpoint['name']
                author = checkpoint['author']
                chap_data = checkpoint['chapters']
                story_info = checkpoint.get('story_info', {})
                story_url = checkpoint.get('story_url', '')

                to_retry = list(self.crawler.failed_chapters)
                fixed_count = 0

                for item in to_retry:
                    c_num = item['num']
                    c_url = item['url']
                    c_title = item.get('title', f"Chương {c_num}")
                    log_manager.log(f"   🔄 Thử lại Chương {c_num}...", "info")
                    try:
                        t, cont = self.crawler.get_chapter_content(c_url, c_num, fast_mode=True)
                        chap_data = [cd for cd in chap_data if cd['num'] != c_num]
                        chap_data.append({
                            'num': c_num,
                            'title': t or c_title,
                            'content': cont
                        })
                        chap_data.sort(key=lambda x: x['num'])
                        self.crawler.failed_chapters = [fc for fc in self.crawler.failed_chapters if fc['num'] != c_num]
                        fixed_count += 1
                        log_manager.log(f"   ✅ Đã sửa thành công Chương {c_num}!", "success")
                    except Exception as e:
                        log_manager.log(f"   ❌ Vẫn lỗi Chương {c_num}: {e}", "error")

                # Lưu checkpoint đã sửa
                self.checkpoint_manager.save(
                    slug=slug,
                    name=name,
                    author=author,
                    chapters_done=chap_data,
                    all_chapters=checkpoint.get('all_chapters', []),
                    last_index=len(chap_data),
                    story_info=story_info,
                    story_url=story_url,
                    status=checkpoint.get('status', 'Đang cập nhật')
                )

                if fixed_count > 0:
                    log_manager.log(f"📚 Đang tạo lại file EPUB sau khi sửa thành công {fixed_count} chương...", "info")
                    files = self.epub_builder.create_split_epub(
                        name=name,
                        author=author,
                        chapters=chap_data,
                        split_size=0,
                        story_info=story_info
                    )
                    self.last_results = files or []
                    self.status_text = f"Đã khắc phục {fixed_count} chương lỗi và xuất lại EPUB!"
                    log_manager.log(f"🎉 Hoàn thành tải lại các chương lỗi! Đã xuất {len(files)} file EPUB.", "success")
                else:
                    self.status_text = "Không có chương lỗi nào được khắc phục."
                    log_manager.log("⚠️ Không thể tải lại các chương lỗi. Vui lòng kiểm tra lại link chương.", "warn")
            except Exception as e:
                self.status_text = f"Lỗi tải lại: {e}"
                log_manager.log(f"❌ Lỗi tải lại: {e}", "error")
            finally:
                self.is_crawling = False

        self.crawler_thread = threading.Thread(target=_retry_worker, daemon=True)
        self.crawler_thread.start()
        return {"success": True, "message": f"Bắt đầu tải lại {len(self.crawler.failed_chapters)} chương lỗi trong luồng nền!"}

    def toggle_pause(self) -> Dict[str, Any]:
        """Tạm dừng hoặc tiếp tục."""
        if hasattr(self.human, "pause_controller") and self.human.pause_controller:
            self.human.pause_controller.toggle_pause()
            is_paused = self.human.pause_controller.is_paused
            self.is_paused = is_paused
            state_str = "Tạm dừng" if is_paused else "Tiếp tục"
            log_manager.log(f"⏸️ Tiến trình: {state_str}", "pause" if is_paused else "resume")
            return {"success": True, "is_paused": is_paused, "message": f"Đã {state_str}!"}
        return {"success": False, "message": "Bộ điều khiển tạm dừng chưa sẵn sàng."}

    def stop_crawl(self) -> Dict[str, Any]:
        """Yêu cầu dừng cào và lưu checkpoint an toàn."""
        self.stop_requested = True
        if hasattr(self.crawler, 'request_stop'):
            self.crawler.request_stop()
        if hasattr(self.human, "pause_controller") and self.human.pause_controller:
            self.human.pause_controller.request_stop()
        self.status_text = "Đang dừng tiến trình..."
        log_manager.log("⏹️ Đã nhận yêu cầu dừng. Đang chốt checkpoint chương hiện tại...", "warn")
        return {"success": True, "message": "Đã gửi yêu cầu dừng an toàn."}


controller = WebCrawlerController()


# =========================================================================
# FLASK ROUTES (API & FRONTEND)
# =========================================================================

@app.route("/")
def index():
    """Giao diện chính."""
    return render_template("index.html")


@app.route("/api/status")
def api_status():
    """Lấy trạng thái crawler."""
    return jsonify(controller.get_status_dict())


@app.route("/api/logs")
def api_logs():
    """Lấy lịch sử log gần nhất."""
    count = request.args.get("count", default=200, type=int)
    return jsonify({"logs": log_manager.get_recent(count)})


@app.route("/api/logs/stream")
def api_logs_stream():
    """Server-Sent Events (SSE) để truyền log trực tiếp 0ms latency."""
    def event_stream():
        q = log_manager.subscribe()
        try:
            # Gửi chào mừng và kết nối thành công
            yield f"data: {json.dumps({'type': 'system', 'text': '🔗 Kết nối Live Console thành công!'})}\n\n"
            while True:
                try:
                    entry = q.get(timeout=25.0)
                    yield f"data: {json.dumps(entry)}\n\n"
                except queue.Empty:
                    # Gửi heartbeat giữ kết nối
                    yield ": ping\n\n"
        except GeneratorExit:
            pass
        finally:
            log_manager.unsubscribe(q)

    return Response(event_stream(), mimetype="text/event-stream")


@app.route("/api/crawl/start", methods=["POST"])
def api_crawl_start():
    """Bắt đầu cào truyện."""
    data = request.json or {}
    url = data.get("url", "").strip()
    mode = str(data.get("mode", "1"))
    custom_chap = int(data.get("custom_chap", 5))
    session_limit = data.get("session_limit")
    if session_limit is not None and session_limit != "":
        session_limit = int(session_limit)
    else:
        session_limit = None
    split_size = int(data.get("split_size", 0))
    engine = data.get("engine", "human")
    fast_delay = float(data.get("fast_delay", 0.8))
    concurrency = int(data.get("concurrency", 3))
    range_start = data.get("range_start")
    range_start = int(range_start) if range_start is not None and range_start != "" else None
    range_end = data.get("range_end")
    range_end = int(range_end) if range_end is not None and range_end != "" else None
    reverse_order = bool(data.get("reverse_order", False))
    override_title = data.get("override_title")
    override_author = data.get("override_author")
    override_summary = data.get("override_summary")
    override_cover = data.get("override_cover")
    custom_classes = data.get("custom_classes", "")

    res = controller.start_crawl(
        raw_url_or_slug=url,
        mode=mode,
        custom_chap=custom_chap,
        session_limit=session_limit,
        split_size=split_size,
        engine=engine,
        fast_delay=fast_delay,
        concurrency=concurrency,
        range_start=range_start,
        range_end=range_end,
        reverse_order=reverse_order,
        override_title=override_title,
        override_author=override_author,
        override_summary=override_summary,
        override_cover=override_cover,
        custom_classes=custom_classes
    )
    return jsonify(res)


@app.route("/api/crawl/retry-failed", methods=["POST"])
def api_crawl_retry_failed():
    """Tải lại các chương bị lỗi."""
    return jsonify(controller.retry_failed_chapters())


@app.route("/api/crawl/pause", methods=["POST"])
def api_crawl_pause():
    """Tạm dừng / Tiếp tục."""
    return jsonify(controller.toggle_pause())


@app.route("/api/crawl/stop", methods=["POST"])
def api_crawl_stop():
    """Dừng an toàn."""
    return jsonify(controller.stop_crawl())


@app.route("/api/checkpoints", methods=["GET"])
def api_checkpoints():
    """Danh sách các checkpoint đã lưu."""
    checkpoints = controller.checkpoint_manager.list_checkpoints()
    return jsonify({"checkpoints": checkpoints})


@app.route("/api/checkpoints/delete", methods=["POST"])
def api_checkpoint_delete():
    """Xóa 1 checkpoint."""
    data = request.json or {}
    slug = data.get("slug", "").strip()
    if not slug:
        return jsonify({"success": False, "message": "Thiếu slug checkpoint"})
    ok = controller.checkpoint_manager.delete(slug)
    log_manager.log(f"🗑️ Đã xóa checkpoint: {slug}", "warn")
    return jsonify({"success": ok, "message": f"Đã xóa checkpoint '{slug}'"})


@app.route("/api/cleaner/process", methods=["POST"])
def api_cleaner_process():
    """Xử lý làm sạch file EPUB có định dạng lạ."""
    try:
        custom_classes = request.form.get("custom_classes", "").strip()
        uploaded_file = request.files.get("file")
        file_path = request.form.get("file_path", "").strip()

        target_file = ""
        if uploaded_file and uploaded_file.filename:
            temp_dir = os.path.join(os.getcwd(), "epubs", "temp_upload")
            os.makedirs(temp_dir, exist_ok=True)
            target_file = os.path.join(temp_dir, uploaded_file.filename)
            uploaded_file.save(target_file)
        elif file_path and os.path.isfile(file_path):
            target_file = file_path
        else:
            return jsonify({"success": False, "message": "Vui lòng chọn hoặc tải lên file EPUB hợp lệ!"})

        log_manager.log(f"\n🧹 [EPUB Cleaner] Bắt đầu xử lý: {os.path.basename(target_file)}...", "cleaner")
        clean_dir = os.path.join(os.getcwd(), "epubs", "cleaned")
        os.makedirs(clean_dir, exist_ok=True)
        base_name = os.path.splitext(os.path.basename(target_file))[0]
        output_file = os.path.join(clean_dir, f"{base_name}_cleaned.epub")

        stats = EpubFileCleaner.clean_epub_file(
            input_path=target_file,
            output_path=output_file,
            custom_classes=custom_classes if custom_classes else None
        )

        log_manager.log(f"✅ [EPUB Cleaner] Hoàn thành: Đã lưu tại epubs/cleaned/{os.path.basename(output_file)}", "success")
        return jsonify({
            "success": True,
            "filename": os.path.basename(output_file),
            "output_path": output_file,
            "stats": stats
        })
    except Exception as e:
        log_manager.log(f"❌ [EPUB Cleaner] Lỗi: {e}", "error")
        return jsonify({"success": False, "message": str(e)})


@app.route("/api/cleaner/download/<filename>")
def api_cleaner_download(filename):
    """Tải file EPUB đã làm sạch."""
    clean_dir = os.path.join(os.getcwd(), "epubs", "cleaned")
    return send_from_directory(clean_dir, filename, as_attachment=True)


@app.route("/api/parsers", methods=["GET"])
def api_parsers():
    """Danh sách các parser website tùy biến."""
    parsers = [p.to_dict() for p in controller.site_parser_manager.list_parsers()]
    return jsonify({"parsers": parsers})


@app.route("/api/parsers/save", methods=["POST"])
def api_parsers_save():
    """Lưu cấu hình parser cho một domain."""
    data = request.json or {}
    cfg = SiteParserConfig.from_dict(data)
    if not cfg.domain:
        return jsonify({"success": False, "message": "Domain không được để trống!"})
    controller.site_parser_manager.save_parser(cfg)
    if cfg.domain == "giatocvuongtai.com":
        if cfg.login_email:
            AUTH_CONFIG["email"] = cfg.login_email
        if cfg.login_password:
            AUTH_CONFIG["password"] = cfg.login_password
        AUTH_CONFIG["auto_login"] = cfg.auto_login
        if cfg.login_url:
            AUTH_CONFIG["login_url"] = cfg.login_url
    log_manager.log(f"💾 Đã lưu cấu hình parser cho: {cfg.name} ({cfg.domain})", "success")
    return jsonify({"success": True, "message": f"Đã lưu cấu hình cho '{cfg.name}'!"})


@app.route("/api/parsers/delete", methods=["POST"])
def api_parsers_delete():
    """Xóa một cấu hình parser."""
    data = request.json or {}
    domain = data.get("domain", "").strip()
    if domain == "giatocvuongtai.com":
        return jsonify({"success": False, "message": "Không thể xóa cấu hình mặc định Gia Tộc Vượng Tài!"})
    ok = controller.site_parser_manager.delete_parser(domain)
    return jsonify({"success": ok, "message": f"Đã xóa cấu hình '{domain}'"})


@app.route("/api/parsers/auto-detect", methods=["POST"])
def api_parsers_auto_detect():
    """Dò tìm selectors tự động từ URL truyện mẫu."""
    data = request.json or {}
    url = data.get("url", "").strip()
    if not url:
        return jsonify({"success": False, "message": "Vui lòng nhập URL truyện mẫu!"})

    try:
        log_manager.log(f"\n🔍 [Auto Detect] Đang mở trình duyệt phân tích: {url}...", "info")
        controller.browser_manager.ensure_driver_alive()
        driver = controller.browser_manager.driver
        driver.get(url)
        time.sleep(2.5)
        story_html = driver.page_source or ""
        domain = controller.site_parser_manager.get_domain(url)

        chapter_html = ""
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(story_html, "html.parser")
        first_chap_url = ""
        from vtpate.site_parser import FALLBACK_CHAPTER_LIST
        for sel in FALLBACK_CHAPTER_LIST:
            ch_link = soup.select_one(sel)
            if ch_link and ch_link.get("href"):
                from urllib.parse import urljoin
                first_chap_url = urljoin(url, ch_link.get("href"))
                break

        if first_chap_url and first_chap_url != url:
            log_manager.log(f"   🔍 Tìm thấy chương mẫu: {first_chap_url}, đang đọc nội dung...", "info")
            driver.get(first_chap_url)
            time.sleep(2.0)
            chapter_html = driver.page_source or ""

        cfg = controller.site_parser_manager.auto_detect_from_html(
            story_html=story_html,
            chapter_html=chapter_html,
            domain=domain
        )
        log_manager.log(f"✅ [Auto Detect] Phân tích hoàn tất cấu trúc DOM!", "success")
        return jsonify({"success": True, "config": cfg.to_dict()})
    except Exception as e:
        log_manager.log(f"❌ [Auto Detect] Lỗi: {e}", "error")
        return jsonify({"success": False, "message": str(e)})


@app.route("/api/parsers/test", methods=["POST"])
def api_parsers_test():
    """Kiểm tra thử cấu hình selectors & hiển thị toàn bộ định dạng chương (Live Reader Preview)."""
    data = request.json or {}
    url = data.get("url", "").strip()
    chapter_url = data.get("chapter_url", "").strip()
    chapter_num = int(data.get("chapter_num", 1))
    cfg_data = data.get("config", {})

    target_url = chapter_url or url
    if not target_url:
        return jsonify({"success": False, "message": "Vui lòng nhập URL truyện hoặc chương để kiểm tra!"})

    if not target_url.startswith("http://") and not target_url.startswith("https://"):
        target_url = f"https://{target_url}"

    try:
        cfg = SiteParserConfig.from_dict(cfg_data)
        old_parser = controller.crawler.active_custom_parser
        controller.crawler.active_custom_parser = cfg

        # Tự động đăng nhập nếu profile có cấu hình tài khoản
        if cfg.auto_login and cfg.login_email and cfg.login_password:
            controller.browser_manager.ensure_logged_in_for_site(cfg, interactive=False)

        log_manager.log(f"\n🧪 [Test Selectors] Đang kiểm tra định dạng với URL: {target_url}...", "info")

        info = {}
        chaps = []
        chap_title = ""
        chap_html = ""

        # Kiểm tra nếu user yêu cầu trực tiếp một URL chương cụ thể
        is_direct_chap = bool(chapter_url) or any(k in target_url.lower() for k in ["/chuong-", "/chapter-", "-chap-", "chap-", "/c-", "/c/"])

        # 1. Thử lấy thông tin truyện (Tên, tác giả, ảnh bìa)
        try:
            story_root_url = url if url and not is_direct_chap else target_url
            info = controller.crawler.get_story_info(story_root_url)
        except Exception:
            info = {}

        # 2. Lấy danh sách chương nếu là trang chủ truyện
        if not chapter_url:
            try:
                chaps = controller.crawler.get_all_chapters(target_url)
            except Exception:
                chaps = []

        # 3. Trích xuất nội dung chương
        if chaps:
            target_chap = chaps[0]
            if 1 <= chapter_num <= len(chaps):
                target_chap = chaps[chapter_num - 1]
            elif chapter_url:
                for c in chaps:
                    if c.get("url") == chapter_url:
                        target_chap = c
                        break

            chap_title, chap_html = controller.crawler.get_chapter_content(
                target_chap['url'], target_chap['num'], fast_mode=True
            )
            current_num = target_chap.get('num', chapter_num)
            current_url = target_chap.get('url', target_url)
        else:
            # Nếu không tìm thấy danh sách chương hoặc đang test thẳng 1 chương lẻ
            chap_title, chap_html = controller.crawler.get_chapter_content(target_url, chapter_num, fast_mode=True)
            current_num = chapter_num
            current_url = target_url

        controller.crawler.active_custom_parser = old_parser

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(chap_html, "html.parser")

        # Thống kê chi tiết nội dung chương
        paragraphs = soup.find_all("p")
        p_count = len(paragraphs)
        clean_text = soup.get_text(separator=' ', strip=True)
        word_count = len(clean_text.split())
        char_count = len(clean_text)
        imgs = soup.find_all("img")

        preview_chaps = []
        if chaps:
            for c in chaps[:150]:
                preview_chaps.append({
                    "num": c.get("num", 1),
                    "title": c.get("title", f"Chương {c.get('num', 1)}"),
                    "url": c.get("url", "")
                })

        return jsonify({
            "success": True,
            "story_info": info,
            "chapter_count": len(chaps),
            "chapters": preview_chaps,
            "current_chapter_num": current_num,
            "current_chapter_url": current_url,
            "chapter_title": chap_title or f"Chương {current_num}",
            "chapter_html": chap_html,
            "preview_text": clean_text[:350],
            "stats": {
                "paragraphs_count": p_count,
                "words_count": word_count,
                "chars_count": char_count,
                "images_count": len(imgs),
                "has_images": len(imgs) > 0,
                "is_pass_chapter": (p_count == 0 or clean_text.strip().lower() == "pass")
            }
        })
    except Exception as e:
        log_manager.log(f"❌ [Test Selectors] Lỗi kiểm tra: {e}", "error")
        return jsonify({"success": False, "message": str(e)})


@app.route("/api/settings", methods=["GET", "POST"])
def api_settings():
    """Đọc hoặc lưu cài đặt hệ thống và tài khoản theo từng web."""
    if request.method == "POST":
        data = request.json or {}
        try:
            domain = str(data.get("domain", "")).strip().lower()
            email = str(data.get("email", "")).strip()
            password = str(data.get("password", "")).strip()
            login_url = str(data.get("login_url", "")).strip()
            auto_login = bool(data.get("auto_login", True))
            name = str(data.get("name", "")).strip()

            if domain:
                controller.site_parser_manager.save_auth_for_domain(
                    domain=domain,
                    email=email,
                    password=password,
                    login_url=login_url,
                    auto_login=auto_login,
                    name=name
                )
                log_manager.log(f"🔑 Đã lưu thông tin tài khoản cho website '{domain}'", "success")

            # Đồng bộ cấu hình mặc định (Gia Tộc Vượng Tài) nếu cần
            if not domain or domain == "giatocvuongtai.com":
                if "auto_login" in data:
                    AUTH_CONFIG["auto_login"] = auto_login
                if "email" in data:
                    AUTH_CONFIG["email"] = email
                if "password" in data:
                    AUTH_CONFIG["password"] = password
                if login_url:
                    AUTH_CONFIG["login_url"] = login_url

            if "reading_wpm" in data:
                TIMING["reading_wpm"] = max(100, int(data["reading_wpm"]))
            if "chap_break_chance" in data:
                TIMING["chap_break_chance"] = min(1.0, max(0.0, float(data["chap_break_chance"]) / 100.0))

            log_manager.log("⚙️ Đã cập nhật cài đặt hệ thống thành công.", "success")
            return jsonify({"success": True, "message": "Đã lưu cài đặt tài khoản thành công!"})
        except Exception as e:
            return jsonify({"success": False, "message": str(e)})

    accounts = controller.site_parser_manager.list_accounts()
    return jsonify({
        "auth": {
            "auto_login": AUTH_CONFIG.get("auto_login", True),
            "email": AUTH_CONFIG.get("email", ""),
            "password": AUTH_CONFIG.get("password", "")
        },
        "accounts": accounts,
        "timing": {
            "reading_wpm": TIMING.get("reading_wpm", 650),
            "chap_break_chance": int(TIMING.get("chap_break_chance", 0.05) * 100)
        }
    })


@app.route("/api/settings/delete-account", methods=["POST"])
def api_settings_delete_account():
    """Xóa thông tin tài khoản của một domain."""
    data = request.json or {}
    domain = str(data.get("domain", "")).strip().lower()
    if not domain or domain == "giatocvuongtai.com":
        return jsonify({"success": False, "message": "Không thể xóa tài khoản mặc định Gia Tộc Vượng Tài!"})

    cfg = controller.site_parser_manager.sites.get(domain)
    if cfg:
        cfg.login_email = ""
        cfg.login_password = ""
        cfg.auto_login = False
        controller.site_parser_manager.save()
        log_manager.log(f"🗑️ Đã xóa thông tin tài khoản của '{domain}'", "info")
        return jsonify({"success": True, "message": f"Đã xóa tài khoản của '{domain}'"})
    return jsonify({"success": False, "message": "Không tìm thấy domain này"})


@app.route("/api/epubs", methods=["GET"])
def api_epubs():
    """Danh sách các file EPUB đã cào trong thư mục epubs/."""
    epubs_dir = os.path.join(os.getcwd(), "epubs")
    os.makedirs(epubs_dir, exist_ok=True)
    files = []
    for f in os.listdir(epubs_dir):
        if f.lower().endswith(".epub"):
            p = os.path.join(epubs_dir, f)
            st = os.stat(p)
            files.append({
                "filename": f,
                "size_mb": round(st.st_size / (1024 * 1024), 2),
                "modified": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
            })
    files.sort(key=lambda x: x["modified"], reverse=True)
    return jsonify({"files": files})


@app.route("/api/epubs/download/<filename>")
def api_epubs_download(filename):
    """Tải file EPUB đã cào."""
    epubs_dir = os.path.join(os.getcwd(), "epubs")
    return send_from_directory(epubs_dir, filename, as_attachment=True)


@app.route("/api/open-folder", methods=["POST"])
def api_open_folder():
    """Mở thư mục trên máy tính Windows Explorer."""
    data = request.json or {}
    folder_type = data.get("type", "epubs")
    folder_map = {
        "epubs": os.path.join(os.getcwd(), "epubs"),
        "covers": os.path.join(os.getcwd(), "covers"),
        "checkpoints": CHECKPOINT_DIR,
        "cleaned": os.path.join(os.getcwd(), "epubs", "cleaned")
    }
    target = folder_map.get(folder_type, os.getcwd())
    os.makedirs(target, exist_ok=True)
    try:
        if sys.platform == "win32":
            os.startfile(target)
        else:
            subprocess.Popen(["xdg-open", target])
        return jsonify({"success": True, "message": f"Đã mở thư mục {folder_type}!"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})


# =========================================================================
# HTML INSPECTOR / XEM NGUỒN HTML CỦA MỌI TRANG WEB
# =========================================================================

@app.route("/api/inspector/fetch", methods=["POST"])
def api_inspector_fetch():
    """Tải và trả về toàn bộ HTML của một trang web bất kỳ."""
    data = request.json or {}
    url = data.get("url", "").strip()
    use_browser = data.get("use_browser", True)

    if not url:
        return jsonify({"success": False, "message": "Vui lòng nhập URL hợp lệ!"})

    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url

    try:
        log_manager.log(f"\n🔍 [HTML Inspector] Đang tải mã nguồn: {url} (Chế độ: {'Trình duyệt Selenium' if use_browser else 'Fast Request'})...", "info")
        html_content = ""
        page_title = ""

        if use_browser:
            controller.browser_manager.ensure_driver_alive()
            driver = controller.browser_manager.driver
            driver.get(url)
            time.sleep(2.0)
            html_content = driver.page_source or ""
            page_title = driver.title or ""
        else:
            import urllib.request
            import ssl
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE

            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "vi,en;q=0.9"
                }
            )
            with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
                raw_bytes = resp.read()
                try:
                    html_content = raw_bytes.decode("utf-8")
                except UnicodeDecodeError:
                    html_content = raw_bytes.decode("latin-1", errors="replace")

            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html_content, "html.parser")
            if soup.title:
                page_title = soup.title.string or ""

        size_kb = round(len(html_content.encode("utf-8", errors="replace")) / 1024, 2)
        log_manager.log(f"✅ [HTML Inspector] Đã tải xong: {len(html_content):,} ký tự (~{size_kb} KB)", "success")

        return jsonify({
            "success": True,
            "url": url,
            "title": page_title,
            "length": len(html_content),
            "size_kb": size_kb,
            "html": html_content
        })
    except Exception as e:
        log_manager.log(f"❌ [HTML Inspector] Lỗi khi tải trang: {e}", "error")
        return jsonify({"success": False, "message": str(e)})


@app.route("/api/inspector/query", methods=["POST"])
def api_inspector_query():
    """Lọc các phần tử theo CSS selector từ HTML đã tải."""
    data = request.json or {}
    selector = data.get("selector", "").strip()
    html_content = data.get("html", "")

    if not selector:
        return jsonify({"success": False, "message": "Vui lòng nhập CSS selector!"})
    if not html_content:
        return jsonify({"success": False, "message": "Nội dung HTML rỗng!"})

    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html_content, "html.parser")
        matches = soup.select(selector)

        results = []
        for el in matches[:50]:  # Giới hạn 50 phần tử đầu
            text_snippet = el.get_text(separator=' ', strip=True)[:250]
            outer_str = str(el)
            if len(outer_str) > 600:
                outer_str = outer_str[:600] + "..."
            results.append({
                "tag": el.name,
                "classes": el.get("class", []),
                "id": el.get("id", ""),
                "text": text_snippet,
                "outer_html": outer_str
            })

        return jsonify({
            "success": True,
            "selector": selector,
            "total_matches": len(matches),
            "results": results
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})


def run_web(host: str = "127.0.0.1", port: int = 5000, open_browser: bool = True):
    """Khởi chạy web server và mở trình duyệt."""
    print("=" * 65)
    print("🌐 VTPATE WEB SERVER - GIAO DIỆN WEB DÀNH CHO CRAWLER & EPUB CREATOR")
    print(f"👉 Địa chỉ truy cập: http://{host}:{port}")
    print("=" * 65)

    if open_browser:
        def _open():
            time.sleep(1.2)
            try:
                import webbrowser
                webbrowser.open(f"http://{host}:{port}")
            except Exception:
                pass
        threading.Thread(target=_open, daemon=True).start()

    app.run(host=host, port=port, debug=False, threaded=True)


if __name__ == "__main__":
    run_web()

