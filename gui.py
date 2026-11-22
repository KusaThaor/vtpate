"""
Giao diện đồ họa người dùng (GUI) cho ứng dụng cào truyện Gia Tộc Vượng Tài & đóng gói EPUB.
Xây dựng trên nền tảng Tkinter / ttk chuẩn của Python (tương thích tối đa Windows).
"""

import os
import sys
import time
import json
import queue
import threading
import subprocess
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext, filedialog

# Đảm bảo đường dẫn module được nhận diện
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from vtpate.config import BASE_URL, TIMING, AUTH_CONFIG, CHECKPOINT_DIR
from vtpate.browser import BrowserManager, HumanBehavior
from vtpate.checkpoint import CheckpointManager
from vtpate.epub_builder import EpubBuilder
from vtpate.crawler import StoryCrawler
from vtpate.format_processor import ContentFormatCleaner, EpubFileCleaner
from vtpate.site_parser import SiteParserManager, SiteParserConfig, FALLBACK_CHAPTER_LIST


class LogQueueRedirector:
    """Chuyển hướng toàn bộ output của stdout/stderr vào hàng đợi thread-safe để hiển thị lên GUI."""

    def __init__(self, log_queue: queue.Queue):
        self.log_queue = log_queue
        self.original_stdout = sys.stdout

    def write(self, text):
        if text:
            self.log_queue.put(text)
            if self.original_stdout:
                try:
                    self.original_stdout.write(text)
                    self.original_stdout.flush()
                except Exception:
                    pass

    def flush(self):
        if self.original_stdout:
            try:
                self.original_stdout.flush()
            except Exception:
                pass


class CrawlerGUIApp:
    """Ứng dụng giao diện đồ họa chính."""

    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("📚 Gia Tộc Vượng Tài - Story Crawler & EPUB Creator")
        self.root.geometry("1100x780")
        self.root.minsize(960, 680)

        # Trạng thái crawler
        self.is_crawling = False
        self.crawler_thread: threading.Thread = None
        self.stop_requested = False

        # Các module cốt lõi
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

        # Hàng đợi log
        self.log_queue = queue.Queue()
        self.redirector = LogQueueRedirector(self.log_queue)
        sys.stdout = self.redirector
        sys.stderr = self.redirector

        # Cấu hình giao diện và phím tắt
        self._setup_style()
        self._build_ui()
        self._bind_events()

        # Bắt đầu vòng lặp đọc log
        self.root.after(100, self._process_log_queue)

        # Nạp dữ liệu checkpoint ban đầu
        self.refresh_checkpoints()

    @property
    def driver(self):
        return self.browser_manager.driver

    def _create_scrollable_container(self, parent_tab):
        """Tạo khung cuộn chuột mượt mà (Canvas + Scrollbar) cho một Tab."""
        canvas = tk.Canvas(parent_tab, highlightthickness=0, bg="#f8fafc")
        scrollbar = ttk.Scrollbar(parent_tab, orient="vertical", command=canvas.yview)
        scrollable_frame = ttk.Frame(canvas)

        scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        canvas_window = canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.bind("<Configure>", lambda e: canvas.itemconfig(canvas_window, width=e.width))
        canvas.configure(yscrollcommand=scrollbar.set)

        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        return scrollable_frame

    def _setup_style(self):
        """Thiết lập theme và màu sắc giao diện."""
        self.style = ttk.Style()
        try:
            self.style.theme_use("clam")
        except Exception:
            pass

        # Màu sắc chủ đạo
        self.color_primary = "#4A154B"      # Tím than sang trọng
        self.color_primary_hover = "#611f69"
        self.color_accent = "#7c3aed"       # Tím hiện đại
        self.color_bg = "#f8fafc"           # Xám rất nhạt
        self.color_card = "#ffffff"         # Trắng
        self.color_text = "#1e293b"         # Đen xám đậm
        self.color_border = "#e2e8f0"

        self.root.configure(bg=self.color_bg)

        # Style cơ bản
        self.style.configure(".", font=("Segoe UI", 10), background=self.color_bg, foreground=self.color_text)
        self.style.configure("TNotebook", background=self.color_bg)
        self.style.configure("TNotebook.Tab", font=("Segoe UI", 10, "bold"), padding=[16, 8])
        self.style.map("TNotebook.Tab", background=[("selected", self.color_card)], foreground=[("selected", self.color_primary)])

        self.style.configure("Card.TFrame", background=self.color_card, relief="solid", borderwidth=1)
        self.style.configure("Primary.TButton", font=("Segoe UI", 10, "bold"), background=self.color_primary, foreground="#ffffff", padding=8)
        self.style.map("Primary.TButton", background=[("active", self.color_primary_hover)], foreground=[("active", "#ffffff")])

        self.style.configure("Action.TButton", font=("Segoe UI", 10), padding=6)
        self.style.configure("Header.TLabel", font=("Segoe UI", 15, "bold"), foreground=self.color_primary, background=self.color_bg)
        self.style.configure("SubHeader.TLabel", font=("Segoe UI", 11, "bold"), foreground=self.color_text, background=self.color_card)
        self.style.configure("Muted.TLabel", font=("Segoe UI", 9), foreground="#64748b", background=self.color_card)

        # Treeview styling
        self.style.configure("Treeview", font=("Segoe UI", 10), rowheight=28)
        self.style.configure("Treeview.Heading", font=("Segoe UI", 10, "bold"), background="#f1f5f9")

    def _build_ui(self):
        """Xây dựng layout các thành phần giao diện."""
        # Header banner
        header_frame = tk.Frame(self.root, bg=self.color_primary, height=60)
        header_frame.pack(fill="x", side="top")

        title_label = tk.Label(
            header_frame,
            text="📚 GIA TỘC VƯỢNG TÀI - STORY CRAWLER & EPUB",
            font=("Segoe UI", 14, "bold"),
            fg="#ffffff",
            bg=self.color_primary,
            padx=16,
            pady=12
        )
        title_label.pack(side="left")

        subtitle_label = tk.Label(
            header_frame,
            text="Chống phát hiện Bot • Quản lý Checkpoint • Tự cập nhật chương mới",
            font=("Segoe UI", 9),
            fg="#e2e8f0",
            bg=self.color_primary,
            padx=8
        )
        subtitle_label.pack(side="left", fill="y", pady=16)

        self.status_badge = tk.Label(
            header_frame,
            text="🟢 SẴN SÀNG",
            font=("Segoe UI", 9, "bold"),
            bg="#10b981",
            fg="#ffffff",
            padx=10,
            pady=4
        )
        self.status_badge.pack(side="right", padx=16, pady=14)

        self.lbl_auth_header = tk.Label(
            header_frame,
            text=f"🔑 {AUTH_CONFIG.get('email', '')}",
            font=("Segoe UI", 9),
            fg="#e2e8f0",
            bg=self.color_primary,
            padx=8,
            pady=4
        )
        self.lbl_auth_header.pack(side="right", padx=(0, 6), pady=14)

        # Khung chính chia 2 phần: Trên là Tabs, Dưới là Console Log
        main_paned = ttk.PanedWindow(self.root, orient="vertical")
        main_paned.pack(fill="both", expand=True, padx=12, pady=10)

        top_container = ttk.Frame(main_paned)
        main_paned.add(top_container, weight=3)

        bottom_container = ttk.Frame(main_paned)
        main_paned.add(bottom_container, weight=2)

        # Notebook tabs ở top container
        self.notebook = ttk.Notebook(top_container)
        self.notebook.pack(fill="both", expand=True)

        # Tab 1: Cào truyện mới
        self.tab_crawler = ttk.Frame(self.notebook, padding=10)
        self.notebook.add(self.tab_crawler, text="  📖 Cào Truyện Mới  ")
        self._build_crawler_tab()

        # Tab 2: Quản lý Checkpoint & Tự động cập nhật
        self.tab_checkpoints = ttk.Frame(self.notebook, padding=10)
        self.notebook.add(self.tab_checkpoints, text="  💾 Quản Lý Checkpoint & Cập Nhật  ")
        self._build_checkpoints_tab()

        # Tab 3: Cài đặt hệ thống
        self.tab_settings = ttk.Frame(self.notebook, padding=10)
        self.notebook.add(self.tab_settings, text="  ⚙️ Cài Đặt  ")
        self._build_settings_tab()

        # Tab 4: Xử lý file EPUB lạ
        self.tab_cleaner = ttk.Frame(self.notebook, padding=10)
        self.notebook.add(self.tab_cleaner, text="  🧹 Xử Lý EPUB Lạ  ")
        self._build_cleaner_tab()

        # Tab 5: Tùy chỉnh web khác (Custom Site / WebToEpub)
        self.tab_custom_site = ttk.Frame(self.notebook, padding=10)
        self.notebook.add(self.tab_custom_site, text="  🌐 Web Khác (WebToEpub)  ")
        self._build_custom_site_tab()

        # Bottom container: Live Console Log
        self._build_log_panel(bottom_container)

    def _build_crawler_tab(self):
        """Nội dung Tab 1: Cào truyện mới (Hỗ trợ cuộn chuột mượt mà)."""
        scroll_container = self._create_scrollable_container(self.tab_crawler)

        # Khung 1: Nhập link truyện
        input_card = ttk.Frame(scroll_container, style="Card.TFrame", padding=14)
        input_card.pack(fill="x", pady=6)

        ttk.Label(input_card, text="🔗 Link hoặc Slug truyện:", style="SubHeader.TLabel").pack(anchor="w")
        ttk.Label(input_card, text="Nhập URL đầy đủ (https://giatocvuongtai.com/stories/slug/) hoặc slug truyện (nhập nhiều link cách nhau dấu phẩy):", style="Muted.TLabel").pack(anchor="w", pady=(0, 6))

        entry_frame = ttk.Frame(input_card)
        entry_frame.pack(fill="x", pady=4)

        self.url_var = tk.StringVar()
        self.url_entry = ttk.Entry(entry_frame, textvariable=self.url_var, font=("Segoe UI", 10))
        self.url_entry.pack(side="left", fill="x", expand=True, padx=(0, 8))

        btn_inspect = ttk.Button(entry_frame, text="🔍 Xem HTML", width=12, command=lambda: self._open_html_inspector(self.url_var.get().strip()))
        btn_inspect.pack(side="right")

        btn_paste = ttk.Button(entry_frame, text="📋 Dán", width=8, command=self._paste_clipboard)
        btn_paste.pack(side="right", padx=(0, 4))

        # Khung 2: Chọn Cơ Chế Cào (Crawl Engine)
        engine_card = ttk.Frame(scroll_container, style="Card.TFrame", padding=14)
        engine_card.pack(fill="x", pady=6)

        ttk.Label(engine_card, text="⚡ Cơ chế cào truyện (Crawl Engine):", style="SubHeader.TLabel").pack(anchor="w", pady=(0, 4))
        ttk.Label(engine_card, text="Lựa chọn giữa cơ chế chống quét bot giả lập người đọc hoặc cơ chế siêu tốc không giới hạn thời gian như plugin WebToEpub:", style="Muted.TLabel").pack(anchor="w", pady=(0, 6))

        self.crawl_engine_var = tk.StringVar(value="human")

        # Option 1: Chống Bot
        row_eng_human = ttk.Frame(engine_card)
        row_eng_human.pack(fill="x", pady=2)
        ttk.Radiobutton(
            row_eng_human,
            text="🛡️ Chế độ Chống Bot (Giả lập người đọc thật)",
            variable=self.crawl_engine_var,
            value="human",
            command=self._on_engine_changed
        ).pack(side="left")
        ttk.Label(row_eng_human, text="— Tính WPM theo số từ (650 wpm), cuộn đọc tự nhiên, nghỉ dài định kỳ (Khuyên dùng cho web chống bot)", style="Muted.TLabel").pack(side="left", padx=6)

        # Option 2: Siêu Tốc WebToEpub
        row_eng_web = ttk.Frame(engine_card)
        row_eng_web.pack(fill="x", pady=2)
        ttk.Radiobutton(
            row_eng_web,
            text="⚡ Chế độ Siêu Tốc WebToEpub (Tự động không giới hạn thời gian)",
            variable=self.crawl_engine_var,
            value="web2epub",
            command=self._on_engine_changed
        ).pack(side="left")
        ttk.Label(row_eng_web, text="— Cào liên tục không giới hạn, trích xuất tức thì (~1s/chương), tốc độ tối đa như plugin WebToEpub", style="Muted.TLabel").pack(side="left", padx=6)

        # Hàng phụ trợ cấu hình cho WebToEpub
        row_web_opts = ttk.Frame(engine_card)
        row_web_opts.pack(fill="x", pady=(4, 0))
        ttk.Label(row_web_opts, text="   ⏱️ Delay giữa các chương (chế độ WebToEpub):", font=("Segoe UI", 9)).pack(side="left")
        self.fast_delay_var = tk.StringVar(value="0.8")
        entry_fast_delay = ttk.Entry(row_web_opts, textvariable=self.fast_delay_var, width=6)
        entry_fast_delay.pack(side="left", padx=4)
        ttk.Label(row_web_opts, text="giây (Mặc định 0.8s, khuyên dùng 0.5s - 1.5s để server phản hồi ổn định)", style="Muted.TLabel").pack(side="left")

        # Khung 3: Cấu hình phiên cào
        config_card = ttk.Frame(scroll_container, style="Card.TFrame", padding=14)
        config_card.pack(fill="x", pady=6)

        ttk.Label(config_card, text="⚙️ Cấu hình phiên cào truyện:", style="SubHeader.TLabel").pack(anchor="w", pady=(0, 8))

        grid_frame = ttk.Frame(config_card)
        grid_frame.pack(fill="x")

        # Cột 1: Chế độ cào
        col1 = ttk.Frame(grid_frame)
        col1.pack(side="left", fill="both", expand=True, padx=4)

        ttk.Label(col1, text="Mục tiêu cào:", font=("Segoe UI", 9, "bold")).pack(anchor="w")
        self.mode_var = tk.StringVar(value="1")
        ttk.Radiobutton(col1, text="1. Toàn bộ truyện (FULL)", variable=self.mode_var, value="1").pack(anchor="w", pady=2)
        ttk.Radiobutton(col1, text="2. Thử nghiệm (TEST 5 chương)", variable=self.mode_var, value="2").pack(anchor="w", pady=2)
        custom_mode_frame = ttk.Frame(col1)
        custom_mode_frame.pack(anchor="w", pady=2)
        ttk.Radiobutton(custom_mode_frame, text="3. Tùy chỉnh số chương:", variable=self.mode_var, value="3").pack(side="left")
        self.custom_chap_var = tk.StringVar(value="20")
        self.custom_chap_entry = ttk.Entry(custom_mode_frame, textvariable=self.custom_chap_var, width=6)
        self.custom_chap_entry.pack(side="left", padx=4)

        # Cột 2: Giới hạn phiên
        col2 = ttk.Frame(grid_frame)
        col2.pack(side="left", fill="both", expand=True, padx=4)

        ttk.Label(col2, text="Số chương mỗi phiên:", font=("Segoe UI", 9, "bold")).pack(anchor="w")
        self.session_limit_var = tk.StringVar(value="20 chương / phiên (Khuyên dùng)")
        self.combo_session = ttk.Combobox(
            col2,
            textvariable=self.session_limit_var,
            state="readonly",
            values=[
                "20 chương / phiên (Khuyên dùng)",
                "50 chương / phiên (Chạy đêm)",
                "100 chương / phiên",
                "Không giới hạn (Crawl hết)"
            ]
        )
        self.combo_session.pack(fill="x", pady=4)
        ttk.Label(col2, text="Tự động lưu checkpoint, có thể tắt app chạy tiếp.", style="Muted.TLabel").pack(anchor="w")

        # Cột 3: Chia nhỏ file EPUB
        col3 = ttk.Frame(grid_frame)
        col3.pack(side="left", fill="both", expand=True, padx=4)

        ttk.Label(col3, text="Chia nhỏ file EPUB:", font=("Segoe UI", 9, "bold")).pack(anchor="w")
        self.split_var = tk.StringVar(value="500 chương / file (Khuyên dùng)")
        self.combo_split = ttk.Combobox(
            col3,
            textvariable=self.split_var,
            state="readonly",
            values=[
                "Không chia (1 file duy nhất)",
                "100 chương / file",
                "300 chương / file",
                "500 chương / file (Khuyên dùng)",
                "1000 chương / file"
            ]
        )
        self.combo_split.pack(fill="x", pady=4)
        ttk.Label(col3, text="Chia nhỏ file giúp máy đọc sách tải nhẹ hơn.", style="Muted.TLabel").pack(anchor="w")

        # Hàng tùy chọn xóa class thủ công khi cào (nếu người dùng muốn)
        row_cls_crawl = ttk.Frame(config_card)
        row_cls_crawl.pack(fill="x", pady=(12, 0))
        ttk.Label(row_cls_crawl, text="🎯 Tự điền class cần xóa (Thủ công):", font=("Segoe UI", 9, "bold")).pack(side="left")
        self.crawler_custom_classes_var = tk.StringVar(value="")
        entry_crawl_cls = ttk.Entry(row_cls_crawl, textvariable=self.crawler_custom_classes_var, font=("Segoe UI", 9), width=35)
        entry_crawl_cls.pack(side="left", padx=8)
        ttk.Label(row_cls_crawl, text="(để trống = tự động quét thẻ ẩn; điền class = CHỈ xóa đúng các class đó)", style="Muted.TLabel").pack(side="left")

        # Khung 3: Nút điều khiển & Tiến độ
        control_card = ttk.Frame(scroll_container, style="Card.TFrame", padding=14)
        control_card.pack(fill="x", pady=6)

        btn_row = ttk.Frame(control_card)
        btn_row.pack(fill="x", pady=(0, 10))

        self.btn_start = tk.Button(
            btn_row,
            text="▶️  BẮT ĐẦU CÀO TRUYỆN",
            font=("Segoe UI", 11, "bold"),
            bg="#7c3aed",
            fg="#ffffff",
            activebackground="#611f69",
            activeforeground="#ffffff",
            padx=20,
            pady=8,
            relief="flat",
            cursor="hand2",
            command=self.start_crawling_from_input
        )
        self.btn_start.pack(side="left", padx=(0, 10))

        self.btn_pause = tk.Button(
            btn_row,
            text="⏸️  TẠM DỪNG (Phím Cách)",
            font=("Segoe UI", 10, "bold"),
            bg="#f59e0b",
            fg="#ffffff",
            activebackground="#d97706",
            activeforeground="#ffffff",
            padx=16,
            pady=8,
            relief="flat",
            state="disabled",
            cursor="hand2",
            command=self.toggle_pause
        )
        self.btn_pause.pack(side="left", padx=(0, 10))

        self.btn_stop = tk.Button(
            btn_row,
            text="⏹️  DỪNG & LƯU CHECKPOINT",
            font=("Segoe UI", 10, "bold"),
            bg="#ef4444",
            fg="#ffffff",
            activebackground="#dc2626",
            activeforeground="#ffffff",
            padx=16,
            pady=8,
            relief="flat",
            state="disabled",
            cursor="hand2",
            command=self.stop_crawling
        )
        self.btn_stop.pack(side="left")

        # Tiến trình
        progress_row = ttk.Frame(control_card)
        progress_row.pack(fill="x")

        self.progress_bar = ttk.Progressbar(progress_row, mode="determinate")
        self.progress_bar.pack(fill="x", pady=(0, 4))

        self.lbl_progress = ttk.Label(progress_row, text="Tiến độ: Chưa bắt đầu", font=("Segoe UI", 9))
        self.lbl_progress.pack(anchor="w")

    def _build_checkpoints_tab(self):
        """Nội dung Tab 2: Quản lý Checkpoint & Tự động cập nhật."""
        header_box = ttk.Frame(self.tab_checkpoints)
        header_box.pack(fill="x", pady=(0, 8))

        ttk.Label(header_box, text="💾 Danh sách truyện có Checkpoint (Dở dang & Đang cập nhật):", font=("Segoe UI", 11, "bold")).pack(side="left", anchor="w")

        btn_refresh = ttk.Button(header_box, text="🔄 Làm mới", width=10, command=self.refresh_checkpoints)
        btn_refresh.pack(side="right")

        # Treeview danh sách checkpoint
        tree_frame = ttk.Frame(self.tab_checkpoints)
        tree_frame.pack(fill="both", expand=True)

        columns = ("name", "author", "status", "progress", "saved_at", "slug")
        self.tree_checkpoints = ttk.Treeview(tree_frame, columns=columns, show="headings", selectmode="browse")

        self.tree_checkpoints.heading("name", text="📖 Tên Truyện")
        self.tree_checkpoints.heading("author", text="✍️ Tác Giả")
        self.tree_checkpoints.heading("status", text="📊 Trạng Thái Web")
        self.tree_checkpoints.heading("progress", text="📑 Tiến Độ Cào")
        self.tree_checkpoints.heading("saved_at", text="🕒 Lưu Gần Nhất")
        self.tree_checkpoints.heading("slug", text="🔗 Slug")

        self.tree_checkpoints.column("name", width=280, anchor="w")
        self.tree_checkpoints.column("author", width=140, anchor="w")
        self.tree_checkpoints.column("status", width=140, anchor="center")
        self.tree_checkpoints.column("progress", width=130, anchor="center")
        self.tree_checkpoints.column("saved_at", width=150, anchor="center")
        self.tree_checkpoints.column("slug", width=120, anchor="w")

        tree_scroll_y = ttk.Scrollbar(tree_frame, orient="vertical", command=self.tree_checkpoints.yview)
        self.tree_checkpoints.configure(yscrollcommand=tree_scroll_y.set)

        self.tree_checkpoints.pack(side="left", fill="both", expand=True)
        tree_scroll_y.pack(side="right", fill="y")

        # Double click để chọn
        self.tree_checkpoints.bind("<Double-1>", lambda event: self.resume_selected_checkpoint())

        # Action Toolbar bên dưới bảng
        action_bar = ttk.Frame(self.tab_checkpoints, padding=(0, 10))
        action_bar.pack(fill="x")

        self.btn_check_update = tk.Button(
            action_bar,
            text="🔄  Kiểm Tra Chương Mới (Web)",
            font=("Segoe UI", 10, "bold"),
            bg="#2563eb",
            fg="#ffffff",
            activebackground="#1d4ed8",
            activeforeground="#ffffff",
            padx=14,
            pady=6,
            relief="flat",
            cursor="hand2",
            command=self.check_selected_for_updates
        )
        self.btn_check_update.pack(side="left", padx=(0, 8))

        self.btn_resume_cp = tk.Button(
            action_bar,
            text="▶️  Cào Tiếp / Cập Nhật",
            font=("Segoe UI", 10, "bold"),
            bg="#7c3aed",
            fg="#ffffff",
            activebackground="#611f69",
            activeforeground="#ffffff",
            padx=14,
            pady=6,
            relief="flat",
            cursor="hand2",
            command=self.resume_selected_checkpoint
        )
        self.btn_resume_cp.pack(side="left", padx=(0, 8))

        self.btn_export_epub = tk.Button(
            action_bar,
            text="📚  Xuất Lại EPUB",
            font=("Segoe UI", 10),
            bg="#0d9488",
            fg="#ffffff",
            activebackground="#0f766e",
            activeforeground="#ffffff",
            padx=12,
            pady=6,
            relief="flat",
            cursor="hand2",
            command=self.export_epub_from_selected
        )
        self.btn_export_epub.pack(side="left", padx=(0, 8))

        self.btn_delete_cp = tk.Button(
            action_bar,
            text="🗑️  Xóa Checkpoint",
            font=("Segoe UI", 10),
            bg="#ef4444",
            fg="#ffffff",
            activebackground="#dc2626",
            activeforeground="#ffffff",
            padx=12,
            pady=6,
            relief="flat",
            cursor="hand2",
            command=self.delete_selected_checkpoint
        )
        self.btn_delete_cp.pack(side="left", padx=(0, 8))

        # Ghi chú quy tắc
        note_frame = ttk.Frame(self.tab_checkpoints, style="Card.TFrame", padding=8)
        note_frame.pack(fill="x", pady=(4, 0))
        note_text = (
            "📌 Quy tắc Checkpoint:\n"
            "• [Đang cập nhật]: Checkpoint được giữ vĩnh viễn dù đã cào đủ số chương hiện có trên web. "
            "Bấm 'Kiểm tra chương mới' để tự động nạp thêm chương mới khi tác giả đăng bài!\n"
            "• [Hoàn thành]: Chỉ xóa checkpoint khi truyện ĐÃ HOÀN THÀNH và ĐÃ CÀO FULL toàn bộ chương."
        )
        ttk.Label(note_frame, text=note_text, font=("Segoe UI", 9), foreground="#475569").pack(anchor="w")

    def _build_settings_tab(self):
        """Nội dung Tab 3: Cài đặt hệ thống (Hỗ trợ cuộn chuột mượt mà)."""
        settings_frame = self._create_scrollable_container(self.tab_settings)

        # Card 1: Tài khoản đăng nhập
        card_auth = ttk.Frame(settings_frame, style="Card.TFrame", padding=14)
        card_auth.pack(fill="x", pady=6)

        ttk.Label(card_auth, text="🔐 Tài khoản đăng nhập Gia Tộc Vượng Tài:", style="SubHeader.TLabel").pack(anchor="w", pady=(0, 6))

        self.auto_login_var = tk.BooleanVar(value=AUTH_CONFIG.get("auto_login", True))
        ttk.Checkbutton(card_auth, text="Bật tự động đăng nhập khi khởi động Chrome", variable=self.auto_login_var).pack(anchor="w", pady=2)

        row_email = ttk.Frame(card_auth)
        row_email.pack(fill="x", pady=4)
        ttk.Label(row_email, text="Email:", width=12).pack(side="left")
        self.email_var = tk.StringVar(value=AUTH_CONFIG.get("email", ""))
        ttk.Entry(row_email, textvariable=self.email_var, width=35).pack(side="left", padx=4)

        row_pass = ttk.Frame(card_auth)
        row_pass.pack(fill="x", pady=4)
        ttk.Label(row_pass, text="Mật khẩu:", width=12).pack(side="left")
        self.pass_var = tk.StringVar(value=AUTH_CONFIG.get("password", ""))
        self.entry_pass = ttk.Entry(row_pass, textvariable=self.pass_var, show="*", width=35)
        self.entry_pass.pack(side="left", padx=4)

        self.lbl_auth_card = ttk.Label(
            card_auth,
            text=f"Trạng thái: 🔑 Chưa kiểm tra ({AUTH_CONFIG.get('email', '')})",
            font=("Segoe UI", 9, "bold"),
            foreground="#64748b"
        )
        self.lbl_auth_card.pack(anchor="w", pady=(6, 4))

        auth_btn_row = ttk.Frame(card_auth)
        auth_btn_row.pack(fill="x", pady=(6, 0))

        btn_auto_login = tk.Button(
            auth_btn_row,
            text="🔐 ĐĂNG NHẬP TỰ ĐỘNG (Auto Login)",
            font=("Segoe UI", 9, "bold"),
            bg="#7c3aed",
            fg="#ffffff",
            activebackground="#611f69",
            activeforeground="#ffffff",
            padx=12,
            pady=6,
            relief="flat",
            cursor="hand2",
            command=self.trigger_auto_login
        )
        btn_auto_login.pack(side="left", padx=(0, 8))

        btn_check_auth = ttk.Button(auth_btn_row, text="🔍 Kiểm Tra Đăng Nhập", command=self.check_login_status_async)
        btn_check_auth.pack(side="left", padx=(0, 8))

        btn_open_browser = ttk.Button(auth_btn_row, text="🌐 Mở Chrome", command=self._open_chrome_manual)
        btn_open_browser.pack(side="left")

        # Card 2: Cấu hình tốc độ đọc & nghỉ chống ban IP
        card_timing = ttk.Frame(settings_frame, style="Card.TFrame", padding=14)
        card_timing.pack(fill="x", pady=6)

        ttk.Label(card_timing, text="⏱️ Tốc độ đọc & Nghỉ chống phát hiện Bot:", style="SubHeader.TLabel").pack(anchor="w", pady=(0, 6))

        row_wpm = ttk.Frame(card_timing)
        row_wpm.pack(fill="x", pady=4)
        ttk.Label(row_wpm, text="Tốc độ đọc trung bình (từ / phút):", width=32).pack(side="left")
        self.wpm_var = tk.StringVar(value=str(TIMING.get("reading_wpm", 650)))
        ttk.Entry(row_wpm, textvariable=self.wpm_var, width=10).pack(side="left", padx=4)
        ttk.Label(row_wpm, text="(Mặc định 650 từ/phút, thời gian đọc tính theo số từ của chương)", style="Muted.TLabel").pack(side="left", padx=4)

        row_chap_break = ttk.Frame(card_timing)
        row_chap_break.pack(fill="x", pady=4)
        ttk.Label(row_chap_break, text="Xác suất nghỉ giữa chương (%):", width=32).pack(side="left")
        self.chap_break_var = tk.StringVar(value=str(int(TIMING.get("chap_break_chance", 0.05) * 100)))
        ttk.Entry(row_chap_break, textvariable=self.chap_break_var, width=10).pack(side="left", padx=4)
        ttk.Label(row_chap_break, text="%(Mặc định 5% chương sẽ nghỉ, 95% đọc liền)", style="Muted.TLabel").pack(side="left", padx=4)

        btn_save_settings = ttk.Button(settings_frame, text="💾 Lưu Cấu Hình", command=self._save_settings)
        btn_save_settings.pack(anchor="w", pady=10)

    def _build_cleaner_tab(self):
        """Nội dung Tab 4: Xử lý và chuẩn hóa file EPUB có định dạng lạ (Hỗ trợ cuộn chuột & Kéo thả)."""
        scroll_container = self._create_scrollable_container(self.tab_cleaner)

        # Card 1: Giới thiệu & Mô tả tính năng
        intro_card = ttk.Frame(scroll_container, style="Card.TFrame", padding=14)
        intro_card.pack(fill="x", pady=6)

        ttk.Label(intro_card, text="🧹 XỬ LÝ & LÀM SẠCH FILE EPUB ĐỊNH DẠNG LẠ", style="Header.TLabel").pack(anchor="w")
        ttk.Label(
            intro_card,
            text="Công cụ chuyên dụng quét sạch thẻ p ẩn, style tàng hình (display:none, opacity:0, font-size:0, off-screen),\n"
                 "ký tự zero-width, bẫy honeypot, watermark spam và chuẩn hóa màu sắc cho Dark Mode trên máy đọc sách.",
            style="Muted.TLabel"
        ).pack(anchor="w", pady=(2, 0))

        # Drop Zone Card (Hỗ trợ kéo thả chuột)
        drop_card = tk.Frame(scroll_container, bg="#f1f5f9", bd=2, relief="groove", padx=16, pady=10)
        drop_card.pack(fill="x", pady=6)

        lbl_drop_title = tk.Label(
            drop_card,
            text="📥 KÉO & THẢ FILE .EPUB HOẶC THƯ MỤC VÀO ĐÂY",
            font=("Segoe UI", 11, "bold"),
            fg="#0284c7",
            bg="#f1f5f9"
        )
        lbl_drop_title.pack(pady=(2, 2))
        lbl_drop_sub = tk.Label(
            drop_card,
            text="Kéo thả trực tiếp file .epub hoặc thư mục từ Windows Explorer vào ứng dụng để tự động nạp",
            font=("Segoe UI", 9),
            fg="#64748b",
            bg="#f1f5f9"
        )
        lbl_drop_sub.pack()

        # Card 2: Chọn File hoặc Thư mục EPUB
        file_card = ttk.Frame(scroll_container, style="Card.TFrame", padding=14)
        file_card.pack(fill="x", pady=6)

        ttk.Label(file_card, text="📁 Chọn file EPUB cần xử lý:", style="SubHeader.TLabel").pack(anchor="w", pady=(0, 6))

        row_file = ttk.Frame(file_card)
        row_file.pack(fill="x", pady=4)

        self.clean_epub_path_var = tk.StringVar()
        entry_file = ttk.Entry(row_file, textvariable=self.clean_epub_path_var, font=("Segoe UI", 10))
        entry_file.pack(side="left", fill="x", expand=True, padx=(0, 8))

        btn_browse_file = tk.Button(
            row_file,
            text="📂 Chọn File EPUB...",
            font=("Segoe UI", 9, "bold"),
            bg="#7c3aed",
            fg="#ffffff",
            activebackground="#6d28d9",
            activeforeground="#ffffff",
            padx=10,
            pady=4,
            relief="flat",
            cursor="hand2",
            command=self._select_clean_epub_file
        )
        btn_browse_file.pack(side="left", padx=(0, 6))

        btn_browse_dir = tk.Button(
            row_file,
            text="📁 Chọn Cả Thư Mục...",
            font=("Segoe UI", 9),
            bg="#f1f5f9",
            fg="#334155",
            padx=10,
            pady=4,
            relief="solid",
            borderwidth=1,
            cursor="hand2",
            command=self._select_clean_epub_dir
        )
        btn_browse_dir.pack(side="left")

        # Card 3: Thiết lập lọc Class (Thủ công hoặc Tự động)
        class_card = ttk.Frame(scroll_container, style="Card.TFrame", padding=14)
        class_card.pack(fill="x", pady=6)

        ttk.Label(class_card, text="🎯 Thiết lập chế độ xóa class (Thủ công hoặc Tự động):", style="SubHeader.TLabel").pack(anchor="w", pady=(0, 4))
        ttk.Label(
            class_card,
            text="• Thủ công: Tự điền tên các class cần xóa (cách nhau dấu phẩy). Hệ thống sẽ CHỈ xóa đúng các thẻ có class này.\n"
                 "• Tự động: Để trống ô này để hệ thống tự động quét và loại bỏ mọi thẻ ẩn, display:none, opacity:0, honeypot.",
            style="Muted.TLabel"
        ).pack(anchor="w", pady=(0, 6))

        row_manual_cls = ttk.Frame(class_card)
        row_manual_cls.pack(fill="x", pady=2)
        ttk.Label(row_manual_cls, text="Class cần xóa (Thủ công):", width=24, font=("Segoe UI", 9, "bold")).pack(side="left")
        self.clean_custom_classes_var = tk.StringVar(value="")
        entry_manual_cls = ttk.Entry(row_manual_cls, textvariable=self.clean_custom_classes_var, font=("Segoe UI", 10))
        entry_manual_cls.pack(side="left", fill="x", expand=True, padx=(0, 6))
        ttk.Label(row_manual_cls, text="(vd: anti-bot, fake-p, hide-me)", style="Muted.TLabel").pack(side="left")

        # Card 4: Tùy chọn làm sạch
        opt_card = ttk.Frame(scroll_container, style="Card.TFrame", padding=14)
        opt_card.pack(fill="x", pady=6)

        ttk.Label(opt_card, text="⚙️ Bộ lọc & Chuẩn hóa định dạng:", style="SubHeader.TLabel").pack(anchor="w", pady=(0, 6))

        self.opt_remove_hidden = tk.BooleanVar(value=True)
        ttk.Checkbutton(
            opt_card,
            text="🛡️ Quét & Xóa triệt để các thẻ ẩn (display:none, visibility:hidden, opacity:0, font-size:0, tọa độ -9999px, aria-hidden)",
            variable=self.opt_remove_hidden
        ).pack(anchor="w", pady=2)

        self.opt_remove_zero_width = tk.BooleanVar(value=True)
        ttk.Checkbutton(
            opt_card,
            text="✨ Lọc sạch ký tự khoảng trắng tàng hình / Zero-Width Space (\\u200b, \\u200c, \\ufeff, watermark chống copy)",
            variable=self.opt_remove_zero_width
        ).pack(anchor="w", pady=2)

        self.opt_remove_spam = tk.BooleanVar(value=True)
        ttk.Checkbutton(
            opt_card,
            text="🚫 Loại bỏ bẫy bot honeypot, watermark spam & thông báo lỗi hệ thống ('Không thể tải lịch hẹn', 'Phiên hết hạn')",
            variable=self.opt_remove_spam
        ).pack(anchor="w", pady=2)

        self.opt_normalize_paras = tk.BooleanVar(value=True)
        ttk.Checkbutton(
            opt_card,
            text="📑 Chuẩn hóa văn bản sang thẻ <p> chuẩn (xử lý sách dùng thẻ <br> liên tiếp hoặc không chia đoạn)",
            variable=self.opt_normalize_paras
        ).pack(anchor="w", pady=2)

        self.opt_clean_dark_mode = tk.BooleanVar(value=True)
        ttk.Checkbutton(
            opt_card,
            text="🌙 Xóa inline style ép màu chữ và màu nền (tương thích 100% chế độ Nền tối / Dark Mode trên Kindle, Kobo, Boox)",
            variable=self.opt_clean_dark_mode
        ).pack(anchor="w", pady=2)

        ttk.Label(
            opt_card,
            text="🔗 Bảo tồn liên kết: KHÔNG xóa link đã chèn (thẻ <a> giữ nguyên liên kết href).\n"
                 "🛡️ Dự phòng chương trống: Nếu chương không có thẻ <p> hoặc nội dung rỗng -> Tự động điền chữ 'pass'.",
            font=("Segoe UI", 9, "italic"),
            foreground="#0369a1"
        ).pack(anchor="w", pady=(6, 2))

        # Card 5: Thực thi và Kết quả
        action_card = ttk.Frame(scroll_container, style="Card.TFrame", padding=14)
        action_card.pack(fill="x", pady=6)

        act_row = ttk.Frame(action_card)
        act_row.pack(fill="x", pady=(0, 8))

        self.btn_run_cleaner = tk.Button(
            act_row,
            text="🚀  BẮT ĐẦU XỬ LÝ & LÀM SẠCH EPUB",
            font=("Segoe UI", 11, "bold"),
            bg="#059669",
            fg="#ffffff",
            activebackground="#047857",
            activeforeground="#ffffff",
            padx=16,
            pady=8,
            relief="flat",
            cursor="hand2",
            command=self._start_clean_epub
        )
        self.btn_run_cleaner.pack(side="left", padx=(0, 10))

        self.btn_open_cleaned_dir = tk.Button(
            act_row,
            text="📂  Mở Thư Mục Chứa File",
            font=("Segoe UI", 10),
            bg="#f1f5f9",
            fg="#1e293b",
            padx=12,
            pady=8,
            relief="solid",
            borderwidth=1,
            cursor="hand2",
            command=self._open_cleaned_folder
        )
        self.btn_open_cleaned_dir.pack(side="left")

        # Khung tóm tắt kết quả
        self.lbl_clean_status = ttk.Label(
            action_card,
            text="📊 Trạng thái: Sẵn sàng xử lý file EPUB.",
            font=("Segoe UI", 9, "bold"),
            foreground="#334155"
        )
        self.lbl_clean_status.pack(anchor="w", pady=(4, 2))

        self.lbl_clean_details = ttk.Label(
            action_card,
            text="Chưa có file nào được quét.",
            font=("Segoe UI", 9),
            foreground="#64748b"
        )
        self.lbl_clean_details.pack(anchor="w")

    def _build_custom_site_tab(self):
        """Nội dung Tab 5: Tùy chỉnh bộ bóc tách cho các website khác (WebToEpub style)."""
        scrollable_frame = self._create_scrollable_container(self.tab_custom_site)

        # Card 1: Giới thiệu
        intro_card = ttk.Frame(scrollable_frame, style="Card.TFrame", padding=12)
        intro_card.pack(fill="x", pady=5)

        ttk.Label(intro_card, text="🌐 TÙY CHỈNH BỘ BÓC TÁCH CHO WEBSITE BẤT KỲ (WEBTOEPUB STYLE)", style="Header.TLabel").pack(anchor="w")
        ttk.Label(
            intro_card,
            text="Hỗ trợ cào dữ liệu từ bất kỳ website truyện nào (truyenfull, metruyenchu, tangthuvien, v.v.).\n"
                 "Bạn có thể nhập URL truyện mẫu và nhấn 'Tự Động Dò Tìm Selector' hoặc tự điền CSS Selector thủ công.",
            style="Muted.TLabel"
        ).pack(anchor="w", pady=(2, 0))

        # Card 2: Quản lý Profile
        profile_card = ttk.Frame(scrollable_frame, style="Card.TFrame", padding=12)
        profile_card.pack(fill="x", pady=5)

        ttk.Label(profile_card, text="📁 Chọn cấu hình trang đã lưu:", style="SubHeader.TLabel").pack(anchor="w", pady=(0, 4))
        p_row = ttk.Frame(profile_card)
        p_row.pack(fill="x")

        self.site_profile_combo = ttk.Combobox(p_row, state="readonly", font=("Segoe UI", 9))
        self.site_profile_combo.pack(side="left", fill="x", expand=True, padx=(0, 8))
        self.site_profile_combo.bind("<<ComboboxSelected>>", self._on_custom_site_profile_selected)

        ttk.Button(p_row, text="➕ Tạo Mới", width=10, command=self._new_custom_site_profile).pack(side="left", padx=(0, 4))
        ttk.Button(p_row, text="💾 Lưu Cấu Hình", width=14, command=self._save_custom_site_profile).pack(side="left", padx=(0, 4))
        ttk.Button(p_row, text="🗑️ Xóa", width=8, command=self._delete_custom_site_profile).pack(side="left")

        # Card 3: Form nhập Selectors
        form_card = ttk.Frame(scrollable_frame, style="Card.TFrame", padding=12)
        form_card.pack(fill="x", pady=5)

        # Variables
        self.cs_domain_var = tk.StringVar()
        self.cs_name_var = tk.StringVar()
        self.cs_sample_url_var = tk.StringVar()
        self.cs_story_title_var = tk.StringVar()
        self.cs_author_var = tk.StringVar()
        self.cs_cover_var = tk.StringVar()
        self.cs_summary_var = tk.StringVar()
        self.cs_chapter_list_var = tk.StringVar()
        self.cs_next_page_var = tk.StringVar()
        self.cs_chapter_title_var = tk.StringVar()
        self.cs_chapter_content_var = tk.StringVar()
        self.cs_custom_classes_var = tk.StringVar()

        # Row 1: URL truyện mẫu + Nút Auto Detect
        ttk.Label(form_card, text="🔗 URL truyện mẫu (để dò tìm & test):", font=("Segoe UI", 9, "bold")).pack(anchor="w", pady=(2, 2))
        url_row = ttk.Frame(form_card)
        url_row.pack(fill="x", pady=(0, 8))
        ttk.Entry(url_row, textvariable=self.cs_sample_url_var, font=("Segoe UI", 9)).pack(side="left", fill="x", expand=True, padx=(0, 8))
        btn_detect = tk.Button(
            url_row,
            text="🔍 Tự Động Dò Tìm Selector (Auto Detect)",
            font=("Segoe UI", 9, "bold"),
            bg="#0284c7",
            fg="#ffffff",
            activebackground="#0369a1",
            activeforeground="#ffffff",
            padx=10,
            command=self._auto_detect_selectors
        )
        btn_detect.pack(side="right")

        btn_view_html = tk.Button(
            url_row,
            text="📄 Xem Full HTML",
            font=("Segoe UI", 9, "bold"),
            bg="#0ea5e9",
            fg="#ffffff",
            activebackground="#0284c7",
            activeforeground="#ffffff",
            padx=10,
            command=lambda: self._open_html_inspector(self.cs_sample_url_var.get().strip())
        )
        btn_view_html.pack(side="right", padx=(0, 6))

        # Grid fields
        grid_frame = ttk.Frame(form_card)
        grid_frame.pack(fill="x")
        grid_frame.columnconfigure(1, weight=1)
        grid_frame.columnconfigure(3, weight=1)

        fields = [
            ("Domain website (bắt buộc):", self.cs_domain_var, "Tên trang hiển thị:", self.cs_name_var),
            ("Tên truyện CSS Selector:", self.cs_story_title_var, "Tác giả CSS Selector:", self.cs_author_var),
            ("Ảnh bìa CSS Selector:", self.cs_cover_var, "Văn án / Tóm tắt CSS:", self.cs_summary_var),
            ("Danh sách chương CSS:", self.cs_chapter_list_var, "Nút sang trang DS (CSS/XPath):", self.cs_next_page_var),
            ("Tiêu đề chương CSS:", self.cs_chapter_title_var, "Nội dung chương CSS:", self.cs_chapter_content_var),
        ]

        for row_idx, (lbl1, var1, lbl2, var2) in enumerate(fields):
            ttk.Label(grid_frame, text=lbl1, font=("Segoe UI", 9)).grid(row=row_idx, column=0, sticky="w", pady=4, padx=(0, 6))
            ttk.Entry(grid_frame, textvariable=var1, font=("Segoe UI", 9)).grid(row=row_idx, column=1, sticky="ew", pady=4, padx=(0, 12))
            ttk.Label(grid_frame, text=lbl2, font=("Segoe UI", 9)).grid(row=row_idx, column=2, sticky="w", pady=4, padx=(0, 6))
            ttk.Entry(grid_frame, textvariable=var2, font=("Segoe UI", 9)).grid(row=row_idx, column=3, sticky="ew", pady=4)

        # Class cần xóa thủ công
        extra_row = ttk.Frame(form_card)
        extra_row.pack(fill="x", pady=(8, 0))
        ttk.Label(extra_row, text="Class cần xóa thủ công (tách bằng dấu phẩy, để trống = tự động xóa bẫy/thẻ ẩn):", font=("Segoe UI", 9)).pack(anchor="w")
        ttk.Entry(extra_row, textvariable=self.cs_custom_classes_var, font=("Segoe UI", 9)).pack(fill="x", pady=2)

        # Card 4: Thao tác & Hành động
        action_card = ttk.Frame(scrollable_frame, style="Card.TFrame", padding=12)
        action_card.pack(fill="x", pady=5)

        act_row = ttk.Frame(action_card)
        act_row.pack(fill="x")

        btn_test = tk.Button(
            act_row,
            text="🧪 Kiểm Tra Thử (Test Chapter 1)",
            font=("Segoe UI", 9, "bold"),
            bg="#f59e0b",
            fg="#ffffff",
            activebackground="#d97706",
            activeforeground="#ffffff",
            padx=12,
            pady=6,
            command=self._test_custom_selectors
        )
        btn_test.pack(side="left", padx=(0, 8))

        btn_apply = tk.Button(
            act_row,
            text="🚀 Áp Dụng & Cào Bằng Cấu Hình Này",
            font=("Segoe UI", 10, "bold"),
            bg="#16a34a",
            fg="#ffffff",
            activebackground="#15803d",
            activeforeground="#ffffff",
            padx=14,
            pady=6,
            command=self._apply_custom_parser_and_crawl
        )
        btn_apply.pack(side="left")

        # Nạp dữ liệu profile ban đầu
        self._refresh_custom_site_profiles()

    def _get_config_from_form(self) -> SiteParserConfig:
        domain = self.cs_domain_var.get().strip().lower()
        if not domain and self.cs_sample_url_var.get().strip():
            domain = self.site_parser_manager.get_domain(self.cs_sample_url_var.get().strip())
        name = self.cs_name_var.get().strip() or domain or "Tùy biến"

        return SiteParserConfig(
            domain=domain,
            name=name,
            story_title_sel=self.cs_story_title_var.get().strip(),
            author_sel=self.cs_author_var.get().strip(),
            cover_sel=self.cs_cover_var.get().strip(),
            summary_sel=self.cs_summary_var.get().strip(),
            chapter_list_sel=self.cs_chapter_list_var.get().strip(),
            next_page_sel=self.cs_next_page_var.get().strip(),
            chapter_title_sel=self.cs_chapter_title_var.get().strip(),
            chapter_content_sel=self.cs_chapter_content_var.get().strip(),
            custom_classes_to_remove=self.cs_custom_classes_var.get().strip()
        )

    def _refresh_custom_site_profiles(self):
        parsers = self.site_parser_manager.list_parsers()
        values = [f"{p.name} ({p.domain})" for p in parsers]
        self.site_profile_combo['values'] = values
        if values:
            self.site_profile_combo.current(0)
            self._load_config_into_form(parsers[0])

    def _load_config_into_form(self, cfg: SiteParserConfig):
        self.cs_domain_var.set(cfg.domain)
        self.cs_name_var.set(cfg.name)
        self.cs_story_title_var.set(cfg.story_title_sel)
        self.cs_author_var.set(cfg.author_sel)
        self.cs_cover_var.set(cfg.cover_sel)
        self.cs_summary_var.set(cfg.summary_sel)
        self.cs_chapter_list_var.set(cfg.chapter_list_sel)
        self.cs_next_page_var.set(cfg.next_page_sel)
        self.cs_chapter_title_var.set(cfg.chapter_title_sel)
        self.cs_chapter_content_var.set(cfg.chapter_content_sel)
        self.cs_custom_classes_var.set(cfg.custom_classes_to_remove)

    def _on_custom_site_profile_selected(self, event=None):
        selected_text = self.site_profile_combo.get()
        parsers = self.site_parser_manager.list_parsers()
        for p in parsers:
            if f"{p.name} ({p.domain})" == selected_text or p.domain in selected_text:
                self._load_config_into_form(p)
                break

    def _new_custom_site_profile(self):
        self.cs_domain_var.set("")
        self.cs_name_var.set("")
        self.cs_sample_url_var.set("")
        self.cs_story_title_var.set("")
        self.cs_author_var.set("")
        self.cs_cover_var.set("")
        self.cs_summary_var.set("")
        self.cs_chapter_list_var.set("")
        self.cs_next_page_var.set("")
        self.cs_chapter_title_var.set("")
        self.cs_chapter_content_var.set("")
        self.cs_custom_classes_var.set("")
        print("\n✨ Đã tạo mới biểu mẫu cấu hình website. Nhập URL mẫu hoặc selectors rồi nhấn 'Lưu'.")

    def _save_custom_site_profile(self):
        cfg = self._get_config_from_form()
        if not cfg.domain:
            messagebox.showwarning("Cảnh báo", "Vui lòng nhập Domain website (vd: truyenfull.vn)!")
            return
        self.site_parser_manager.save_parser(cfg)
        self._refresh_custom_site_profiles()
        for i, val in enumerate(self.site_profile_combo['values']):
            if cfg.domain in val:
                self.site_profile_combo.current(i)
                break
        print(f"💾 Đã lưu cấu hình cho website: {cfg.name} ({cfg.domain})")
        messagebox.showinfo("Thành công", f"Đã lưu cấu hình cho '{cfg.name}' thành công!")

    def _delete_custom_site_profile(self):
        domain = self.cs_domain_var.get().strip().lower()
        if not domain:
            messagebox.showwarning("Cảnh báo", "Chưa chọn cấu hình cần xóa!")
            return
        if domain == "giatocvuongtai.com":
            messagebox.showwarning("Cảnh báo", "Không thể xóa cấu hình mặc định Gia Tộc Vượng Tài!")
            return
        if messagebox.askyesno("Xác nhận", f"Bạn có chắc muốn xóa cấu hình '{domain}'?"):
            self.site_parser_manager.delete_parser(domain)
            self._refresh_custom_site_profiles()
            print(f"🗑️ Đã xóa cấu hình website: {domain}")

    def _auto_detect_selectors(self):
        url = self.cs_sample_url_var.get().strip()
        if not url:
            messagebox.showwarning("Cảnh báo", "Vui lòng nhập URL truyện mẫu để hệ thống dò tìm!")
            return

        def _worker():
            print(f"\n🔍 [Auto Detect] Đang mở trình duyệt và phân tích DOM của: {url}...")
            try:
                self.browser_manager.ensure_driver_alive()
                self.driver.get(url)
                time.sleep(2.5)
                story_html = self.driver.page_source or ""
                domain = self.site_parser_manager.get_domain(url)

                chapter_html = ""
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(story_html, "html.parser")
                first_chap_url = ""
                for sel in FALLBACK_CHAPTER_LIST:
                    ch_link = soup.select_one(sel)
                    if ch_link and ch_link.get("href"):
                        from urllib.parse import urljoin
                        first_chap_url = urljoin(url, ch_link.get("href"))
                        break

                if first_chap_url and first_chap_url != url:
                    print(f"   🔍 Tìm thấy chương mẫu: {first_chap_url}, đang tải để dò nội dung...")
                    self.driver.get(first_chap_url)
                    time.sleep(2.0)
                    chapter_html = self.driver.page_source or ""

                cfg = self.site_parser_manager.auto_detect_from_html(
                    story_html=story_html,
                    chapter_html=chapter_html,
                    domain=domain
                )

                def _update_ui():
                    self.cs_domain_var.set(cfg.domain)
                    self.cs_name_var.set(cfg.name)
                    if cfg.story_title_sel: self.cs_story_title_var.set(cfg.story_title_sel)
                    if cfg.author_sel: self.cs_author_var.set(cfg.author_sel)
                    if cfg.cover_sel: self.cs_cover_var.set(cfg.cover_sel)
                    if cfg.summary_sel: self.cs_summary_var.set(cfg.summary_sel)
                    if cfg.chapter_list_sel: self.cs_chapter_list_var.set(cfg.chapter_list_sel)
                    if cfg.next_page_sel: self.cs_next_page_var.set(cfg.next_page_sel)
                    if cfg.chapter_title_sel: self.cs_chapter_title_var.set(cfg.chapter_title_sel)
                    if cfg.chapter_content_sel: self.cs_chapter_content_var.set(cfg.chapter_content_sel)
                    print(f"\n✅ [Auto Detect] Phân tích hoàn tất:")
                    print(f"   • Tên truyện: {cfg.story_title_sel or 'Không tìm thấy'}")
                    print(f"   • Tác giả: {cfg.author_sel or 'Không tìm thấy'}")
                    print(f"   • Ảnh bìa: {cfg.cover_sel or 'Không tìm thấy'}")
                    print(f"   • Văn án: {cfg.summary_sel or 'Không tìm thấy'}")
                    print(f"   • DS chương: {cfg.chapter_list_sel or 'Không tìm thấy'}")
                    print(f"   • Tên chương: {cfg.chapter_title_sel or 'Không tìm thấy'}")
                    print(f"   • Nội dung: {cfg.chapter_content_sel or 'Không tìm thấy'}")
                    messagebox.showinfo("Auto Detect Thành Công", "Đã tự động phân tích cấu trúc DOM và điền các selectors vào form!\nBạn có thể nhấn 'Kiểm Tra Thử' để xem kết quả trích xuất.")

                self.root.after(0, _update_ui)
            except Exception as e:
                print(f"❌ [Auto Detect] Lỗi khi phân tích: {e}")
                self.root.after(0, lambda: messagebox.showerror("Lỗi Auto Detect", f"Lỗi khi dò tìm selector: {e}"))

        threading.Thread(target=_worker, daemon=True).start()

    def _test_custom_selectors(self):
        url = self.cs_sample_url_var.get().strip()
        if not url:
            messagebox.showwarning("Cảnh báo", "Vui lòng nhập URL truyện mẫu để kiểm tra!")
            return

        cfg = self._get_config_from_form()

        def _worker():
            print(f"\n🧪 [Test Selectors] Đang kiểm tra cấu hình với URL: {url}...")
            try:
                old_parser = self.crawler.active_custom_parser
                self.crawler.active_custom_parser = cfg

                info = self.crawler.get_story_info(url)
                print(f"\n📖 [Kết quả trang truyện]")
                print(f"   • Tên truyện: {info.get('name')}")
                print(f"   • Tác giả: {info.get('author')}")
                print(f"   • Ảnh bìa: {info.get('cover_url') or 'Không có'}")
                print(f"   • Văn án: {info.get('summary', '')[:120]}...")

                print(f"\n📑 [Kiểm tra danh sách chương]")
                chaps = self.crawler.get_all_chapters(url)
                print(f"   • Tìm thấy tổng cộng: {len(chaps)} chương")
                if chaps:
                    first_chap = chaps[0]
                    print(f"   • Chương 1: {first_chap.get('title')} ({first_chap.get('url')})")
                    print(f"\n📖 [Kiểm tra nội dung chương 1]")
                    chap_title, chap_html = self.crawler.get_chapter_content(first_chap['url'], first_chap['num'], fast_mode=True)
                    print(f"   • Tiêu đề nhận diện: {chap_title}")
                    from bs4 import BeautifulSoup
                    soup = BeautifulSoup(chap_html, "html.parser")
                    text_preview = soup.get_text(separator=' ', strip=True)[:250]
                    print(f"   • Nội dung (trích 250 ký tự đầu):\n     \"{text_preview}...\"")
                    self.root.after(0, lambda: messagebox.showinfo(
                        "Kiểm Tra Thành Công",
                        f"Trích xuất thành công!\n\n"
                        f"Tên truyện: {info.get('name')}\n"
                        f"Tác giả: {info.get('author')}\n"
                        f"Số chương tìm thấy: {len(chaps)}\n"
                        f"Chương 1: {chap_title}\n"
                        f"Độ dài chữ chương 1: {len(text_preview)} ký tự"
                    ))
                else:
                    self.root.after(0, lambda: messagebox.showwarning("Cảnh báo", "Không tìm thấy chương nào theo selector danh sách chương hiện tại!"))

                self.crawler.active_custom_parser = old_parser
            except Exception as e:
                print(f"❌ [Test Selectors] Lỗi kiểm tra: {e}")
                self.root.after(0, lambda: messagebox.showerror("Lỗi Kiểm Tra", f"Lỗi khi kiểm tra selector: {e}"))

        threading.Thread(target=_worker, daemon=True).start()

    def _apply_custom_parser_and_crawl(self):
        cfg = self._get_config_from_form()
        if not cfg.domain and not self.cs_sample_url_var.get().strip():
            messagebox.showwarning("Cảnh báo", "Vui lòng nhập Domain hoặc URL truyện!")
            return

        if cfg.domain:
            self.site_parser_manager.save_parser(cfg)
            self._refresh_custom_site_profiles()

        self.crawler.active_custom_parser = cfg
        sample_url = self.cs_sample_url_var.get().strip()
        if sample_url:
            self.url_var.set(sample_url)

        print(f"\n🚀 Đã kích hoạt bộ bóc tách tùy biến cho: {cfg.name} ({cfg.domain})")
        print(f"   • Chuyển sang Tab 'Cào Truyện Mới' và dán URL để sẵn sàng cào.")
        self.notebook.select(self.tab_crawler)
        messagebox.showinfo(
            "Đã Kích Hoạt Bộ Bóc Tách",
            f"Đã nạp thành công cấu hình cho '{cfg.name}'!\n"
            f"Link truyện đã được chuyển sang Tab 1.\n"
            f"Bạn chỉ cần chọn Chế độ cào và bấm 'BẮT ĐẦU CÀO TRUYỆN'."
        )

    def _open_html_inspector(self, initial_url: str = ""):
        """Mở cửa sổ soi mã nguồn Full HTML của bất kỳ trang web nào."""
        win = tk.Toplevel(self.root)
        win.title("🔍 Trình Soi Toàn Bộ Mã Nguồn HTML (HTML Inspector)")
        win.geometry("960x680")
        win.minsize(750, 500)

        # Top bar: URL input
        top_frame = ttk.Frame(win, padding=10)
        top_frame.pack(fill="x")

        ttk.Label(top_frame, text="🔗 URL:", font=("Segoe UI", 9, "bold")).pack(side="left", padx=(0, 4))
        url_var = tk.StringVar(value=initial_url or self.url_var.get().strip() or self.cs_sample_url_var.get().strip())
        entry_url = ttk.Entry(top_frame, textvariable=url_var, font=("Segoe UI", 10))
        entry_url.pack(side="left", fill="x", expand=True, padx=(0, 6))

        use_selenium_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(top_frame, text="Dùng Selenium (Render JS)", variable=use_selenium_var).pack(side="left", padx=(0, 6))

        # Status label
        lbl_status = ttk.Label(win, text="Nhập URL và bấm 'Tải HTML' để xem toàn bộ mã nguồn.", font=("Segoe UI", 9), foreground="#64748b")
        lbl_status.pack(anchor="w", padx=12, pady=(0, 4))

        # Center: ScrolledText for HTML code
        txt_html = scrolledtext.ScrolledText(
            win,
            bg="#0f172a",
            fg="#f8fafc",
            insertbackground="#ffffff",
            font=("Consolas", 9),
            wrap="none"
        )
        txt_html.pack(fill="both", expand=True, padx=10, pady=4)

        # Bottom bar: Search & actions
        bot_frame = ttk.Frame(win, padding=10)
        bot_frame.pack(fill="x")

        ttk.Label(bot_frame, text="🔍 Tìm trong HTML:").pack(side="left", padx=(0, 4))
        search_var = tk.StringVar()
        entry_search = ttk.Entry(bot_frame, textvariable=search_var, width=25)
        entry_search.pack(side="left", padx=(0, 6))

        def _search_text():
            q = search_var.get().strip()
            txt_html.tag_remove("match", "1.0", tk.END)
            if not q:
                return
            idx = "1.0"
            count = 0
            first_idx = None
            while True:
                idx = txt_html.search(q, idx, nocase=True, stopindex=tk.END)
                if not idx:
                    break
                if not first_idx:
                    first_idx = idx
                end_idx = f"{idx}+{len(q)}c"
                txt_html.tag_add("match", idx, end_idx)
                idx = end_idx
                count += 1
            txt_html.tag_config("match", background="#0284c7", foreground="#ffffff")
            if first_idx:
                txt_html.see(first_idx)
            lbl_status.config(text=f"Tìm thấy {count} kết quả cho '{q}'.")

        ttk.Button(bot_frame, text="Tìm", command=_search_text).pack(side="left", padx=(0, 10))

        def _do_fetch():
            target_url = url_var.get().strip()
            if not target_url:
                messagebox.showwarning("Cảnh báo", "Vui lòng nhập URL!", parent=win)
                return
            if not target_url.startswith("http"):
                target_url = "https://" + target_url
                url_var.set(target_url)

            lbl_status.config(text="⏳ Đang tải mã nguồn trang web...", foreground="#0284c7")
            btn_fetch.config(state="disabled")

            def _worker():
                try:
                    html_content = ""
                    if use_selenium_var.get():
                        self.browser_manager.ensure_driver_alive()
                        self.driver.get(target_url)
                        import time
                        time.sleep(2.0)
                        html_content = self.driver.page_source or ""
                    else:
                        import urllib.request
                        import ssl
                        ctx = ssl.create_default_context()
                        ctx.check_hostname = False
                        ctx.verify_mode = ssl.CERT_NONE
                        req = urllib.request.Request(
                            target_url,
                            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36"}
                        )
                        with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
                            html_content = resp.read().decode("utf-8", errors="replace")

                    def _update_ui():
                        txt_html.delete("1.0", tk.END)
                        txt_html.insert("1.0", html_content)
                        size_kb = round(len(html_content.encode('utf-8', errors='replace')) / 1024, 2)
                        lines = len(html_content.splitlines())
                        lbl_status.config(
                            text=f"✅ Đã tải xong: {len(html_content):,} ký tự (~{size_kb} KB, {lines:,} dòng).",
                            foreground="#16a34a"
                        )
                        btn_fetch.config(state="normal")

                    win.after(0, _update_ui)
                except Exception as e:
                    def _err():
                        lbl_status.config(text=f"❌ Lỗi tải trang: {e}", foreground="#dc2626")
                        btn_fetch.config(state="normal")
                    win.after(0, _err)

            threading.Thread(target=_worker, daemon=True).start()

        btn_fetch = tk.Button(
            top_frame,
            text="🌐 Tải & Xem Full HTML",
            font=("Segoe UI", 9, "bold"),
            bg="#0284c7",
            fg="#ffffff",
            padx=10,
            command=_do_fetch
        )
        btn_fetch.pack(side="right")

        def _copy_all():
            content = txt_html.get("1.0", tk.END)
            win.clipboard_clear()
            win.clipboard_append(content)
            messagebox.showinfo("Thông báo", "Đã sao chép toàn bộ HTML vào clipboard!", parent=win)

        ttk.Button(bot_frame, text="📋 Sao Chép Full", command=_copy_all).pack(side="right", padx=(4, 0))

        def _save_file():
            content = txt_html.get("1.0", tk.END)
            if not content.strip():
                return
            p = filedialog.asksaveasfilename(
                title="Lưu file HTML",
                defaultextension=".html",
                filetypes=[("HTML Files", "*.html"), ("All Files", "*.*")],
                parent=win
            )
            if p:
                with open(p, "w", encoding="utf-8") as f:
                    f.write(content)
                messagebox.showinfo("Thành công", f"Đã lưu tại: {p}", parent=win)

        ttk.Button(bot_frame, text="💾 Lưu File .html", command=_save_file).pack(side="right")

        if initial_url:
            win.after(100, _do_fetch)

    def _build_log_panel(self, container):
        """Khung hiển thị nhật ký thời gian thực."""
        log_header = ttk.Frame(container)
        log_header.pack(fill="x", pady=(4, 2))

        ttk.Label(log_header, text="📜 NHẬT KÝ HOẠT ĐỘNG (REAL-TIME CONSOLE):", font=("Segoe UI", 9, "bold")).pack(side="left")

        btn_open_epub_folder = ttk.Button(log_header, text="📂 File EPUB", width=12, command=self._open_epub_folder)
        btn_open_epub_folder.pack(side="right", padx=(4, 0))

        btn_open_covers = ttk.Button(log_header, text="🖼️ Bìa & Văn án", width=14, command=self._open_covers_folder)
        btn_open_covers.pack(side="right", padx=(4, 0))

        btn_open_cp_folder = ttk.Button(log_header, text="💾 Checkpoint", width=13, command=self._open_checkpoint_folder)
        btn_open_cp_folder.pack(side="right", padx=(4, 0))

        btn_clear_log = ttk.Button(log_header, text="🧹 Xóa log", width=10, command=self._clear_logs)
        btn_clear_log.pack(side="right")

        # Ô text log
        self.txt_log = scrolledtext.ScrolledText(
            container,
            bg="#0f172a",          # Slate 900
            fg="#f8fafc",          # Slate 50
            insertbackground="#ffffff",
            font=("Consolas", 10),
            wrap="word"
        )
        self.txt_log.pack(fill="both", expand=True)

        # Định nghĩa các tag màu
        self.txt_log.tag_config("pause", foreground="#f59e0b", font=("Consolas", 10, "bold"))
        self.txt_log.tag_config("resume", foreground="#10b981", font=("Consolas", 10, "bold"))
        self.txt_log.tag_config("success", foreground="#34d399")
        self.txt_log.tag_config("error", foreground="#f87171", font=("Consolas", 10, "bold"))
        self.txt_log.tag_config("warn", foreground="#fbbf24")
        self.txt_log.tag_config("chapter", foreground="#38bdf8", font=("Consolas", 10, "bold"))

    def _bind_events(self):
        """Bắt các sự kiện bàn phím, cuộn chuột và kéo thả file."""
        # Phím Spacebar tạm dừng / tiếp tục
        self.root.bind("<space>", self._on_space_pressed)
        # Cuộn chuột mượt mà toàn cục (Mouse Wheel Scrolling)
        self.root.bind_all("<MouseWheel>", self._on_global_mousewheel)
        # Tắt cửa sổ an toàn
        self.root.protocol("WM_DELETE_WINDOW", self._on_close_window)
        # Kéo thả file & thư mục (Drag and Drop)
        self._setup_drag_and_drop()

    def _on_global_mousewheel(self, event):
        """Xử lý cuộn chuột mượt mà (Mouse Wheel Scrolling) trên toàn bộ ứng dụng."""
        try:
            widget = self.root.winfo_containing(event.x_root, event.y_root)
            if not widget:
                return

            # Nếu chuột đang nằm trong Text / ScrolledText (như console log), để Text tự cuộn
            if isinstance(widget, (tk.Text, scrolledtext.ScrolledText)):
                return

            delta = event.delta
            step = int(-1 * (delta / 120))
            if step == 0:
                step = -1 if delta > 0 else 1

            w = widget
            while w:
                if isinstance(w, tk.Canvas):
                    w.yview_scroll(step, "units")
                    return
                elif isinstance(w, ttk.Treeview):
                    w.yview_scroll(step, "units")
                    return
                elif isinstance(w, tk.Listbox):
                    w.yview_scroll(step, "units")
                    return
                w = getattr(w, "master", None)
        except Exception:
            pass

    def _setup_drag_and_drop(self):
        """Cấu hình kéo thả file/thư mục (Drag and Drop) vào ứng dụng."""
        try:
            import windnd
            windnd.hook_dropfiles(self.root, func=self._on_files_dropped)
            print("✨ Đã kích hoạt tính năng kéo & thả file (Drag & Drop) vào ứng dụng.")
        except Exception as e:
            print(f"ℹ️ Tính năng kéo thả file: {e}")

    def _on_files_dropped(self, files):
        """Xử lý khi người dùng kéo thả file hoặc thư mục vào cửa sổ ứng dụng."""
        if not files:
            return

        cleaned_files = []
        for f in files:
            if isinstance(f, bytes):
                try:
                    f = f.decode('utf-8')
                except Exception:
                    f = f.decode('mbcs', errors='replace')
            cleaned_files.append(os.path.normpath(str(f).strip()))

        if not cleaned_files:
            return

        first_path = cleaned_files[0]

        # 1. Nếu là file .epub -> Tự động chuyển sang Tab 4 (EPUB Cleaner) và nạp file
        if first_path.lower().endswith(".epub"):
            self.notebook.select(self.tab_cleaner)
            self.clean_epub_path_var.set(first_path)
            print(f"\n📥 [Kéo Thả] Đã nhận file EPUB: {first_path}")
            print(f"   👉 Tự động chuyển sang Tab 'Xử Lý EPUB Lạ'. Bạn có thể nhấn 'BẮT ĐẦU XỬ LÝ & LÀM SẠCH EPUB'.")
            self.lbl_clean_status.config(
                text=f"📥 Đã nạp file: {os.path.basename(first_path)}",
                foreground="#0284c7"
            )
            self.lbl_clean_details.config(text=f"Đường dẫn: {first_path}")
            return

        # 2. Nếu là thư mục chứa file .epub -> Chuyển sang Tab 4 (EPUB Cleaner) chế độ quét thư mục
        if os.path.isdir(first_path):
            epub_files = [f for f in os.listdir(first_path) if f.lower().endswith(".epub")] if os.path.exists(first_path) else []
            self.notebook.select(self.tab_cleaner)
            self.clean_epub_path_var.set(first_path)
            print(f"\n📥 [Kéo Thả] Đã nhận thư mục ({len(epub_files)} file EPUB): {first_path}")
            print(f"   👉 Chuyển sang Tab 'Xử Lý EPUB Lạ' chế độ Quét Cả Thư Mục.")
            self.lbl_clean_status.config(
                text=f"📥 Đã nạp thư mục: {len(epub_files)} file EPUB",
                foreground="#0284c7"
            )
            self.lbl_clean_details.config(text=f"Thư mục: {first_path}")
            return

        # 3. Nếu là file .txt -> Đọc danh sách link truyện và đưa vào Tab 1
        if first_path.lower().endswith(".txt"):
            if os.path.isfile(first_path):
                try:
                    with open(first_path, "r", encoding="utf-8") as f_in:
                        lines = [line.strip() for line in f_in.readlines() if line.strip() and not line.startswith("#")]
                    if lines:
                        self.notebook.select(self.tab_crawler)
                        self.url_var.set(", ".join(lines))
                        print(f"\n📥 [Kéo Thả] Đã nạp {len(lines)} link truyện từ file text: {first_path}")
                        return
                except Exception as txt_err:
                    print(f"⚠️ Lỗi đọc file text: {txt_err}")
            self.notebook.select(self.tab_crawler)
            self.url_var.set(first_path)
            return

        # 4. Nếu là file hoặc link bất kỳ -> Đưa vào ô URL truyện ở Tab 1
        self.notebook.select(self.tab_crawler)
        self.url_var.set(first_path)
        print(f"\n📥 [Kéo Thả] Đã nạp: {first_path}")

    def _on_space_pressed(self, event):
        """Bấm phím Space để tạm dừng / tiếp tục khi không đang focus vào ô nhập liệu."""
        widget = self.root.focus_get()
        if isinstance(widget, (ttk.Entry, tk.Entry, scrolledtext.ScrolledText)):
            return  # Đang gõ chữ thì không bắt
        if self.is_crawling:
            self.toggle_pause()

    def _on_close_window(self):
        """Đóng cửa sổ an toàn."""
        if self.is_crawling:
            confirm = messagebox.askyesno(
                "Xác nhận thoát",
                "Tiến trình cào truyện đang chạy!\nCheckpoint đã được lưu tự động sau mỗi chương.\nBạn có chắc chắn muốn dừng và thoát không?"
            )
            if not confirm:
                return

        self.stop_requested = True
        try:
            if hasattr(self.human, "pause_controller") and self.human.pause_controller:
                self.human.pause_controller.stop()
            self.browser_manager.quit()
        except Exception:
            pass

        self.root.destroy()

    def _process_log_queue(self):
        """Đọc tin nhắn từ log_queue và hiển thị lên ScrolledText."""
        try:
            while True:
                msg = self.log_queue.get_nowait()
                tag = None
                if "⏸️" in msg or "TẠM DỪNG" in msg:
                    tag = "pause"
                elif "▶️" in msg or "TIẾP TỤC" in msg:
                    tag = "resume"
                elif "✅" in msg or "THÀNH CÔNG" in msg:
                    tag = "success"
                elif "❌" in msg or "LỖI" in msg or "THẤT BẠI" in msg:
                    tag = "error"
                elif "⚠️" in msg or "Phát hiện" in msg:
                    tag = "warn"
                elif "Chương" in msg and "[" in msg:
                    tag = "chapter"

                if tag:
                    self.txt_log.insert("end", msg, tag)
                else:
                    self.txt_log.insert("end", msg)

                self.txt_log.see("end")
        except queue.Empty:
            pass
        finally:
            self.root.after(100, self._process_log_queue)

    def _clear_logs(self):
        self.txt_log.delete("1.0", "end")

    def _paste_clipboard(self):
        try:
            text = self.root.clipboard_get()
            self.url_var.set(text.strip())
        except Exception:
            pass

    def _open_epub_folder(self):
        path = os.getcwd()
        if os.path.exists(path):
            os.system(f'explorer "{path}"')

    def _open_checkpoint_folder(self):
        path = CHECKPOINT_DIR
        if os.path.exists(path):
            os.system(f'explorer "{path}"')

    def _open_covers_folder(self):
        covers_dir = os.path.join(os.getcwd(), "covers")
        os.makedirs(covers_dir, exist_ok=True)
        os.system(f'explorer "{covers_dir}"')

    def update_auth_ui(self, is_logged: bool, extra: str = ""):
        """Cập nhật giao diện trạng thái đăng nhập trên Header và Tab Cài đặt."""
        email = self.email_var.get().strip() or AUTH_CONFIG.get("email", "")
        if is_logged:
            text_hdr = f"🟢 Đã đăng nhập: {email}"
            self.lbl_auth_header.config(text=text_hdr, fg="#10b981")
            self.lbl_auth_card.config(text=f"Trạng thái: 🟢 ĐÃ ĐĂNG NHẬP ({email})", foreground="#10b981")
        else:
            reason = f" ({extra})" if extra else ""
            text_hdr = f"🔴 Chưa đăng nhập{reason}"
            self.lbl_auth_header.config(text=text_hdr, fg="#f59e0b")
            self.lbl_auth_card.config(text=f"Trạng thái: 🔴 CHƯA ĐĂNG NHẬP{reason}", foreground="#ef4444")

    def trigger_auto_login(self):
        """Kích hoạt tự động đăng nhập từ giao diện Cài đặt."""
        threading.Thread(target=self._worker_auto_login, daemon=True).start()

    def _worker_auto_login(self):
        print("\n" + "=" * 60)
        print("🔐 ĐANG THỰC HIỆN TỰ ĐỘNG ĐĂNG NHẬP...")
        print("=" * 60)
        try:
            email = self.email_var.get().strip()
            password = self.pass_var.get().strip()
            if not email or not password:
                print("❌ Vui lòng nhập đầy đủ Email và Mật khẩu trong phần Cài đặt!")
                messagebox.showwarning("Cảnh báo", "Vui lòng nhập đầy đủ Email và Mật khẩu!")
                return

            AUTH_CONFIG["email"] = email
            AUTH_CONFIG["password"] = password

            self.browser_manager.ensure_driver_alive()
            curr = self.browser_manager.driver.current_url or ""
            if curr.startswith("data:") or curr.startswith("about:") or not curr:
                self.browser_manager.driver.get(BASE_URL)
                time.sleep(1.5)

            if self.browser_manager.is_logged_in():
                print(f"✅ Tài khoản {email} ĐÃ ĐƯỢC ĐĂNG NHẬP từ trước (Profile đã lưu session)!")
                self.root.after(0, lambda: self.update_auth_ui(True))
                messagebox.showinfo("Đăng nhập", f"Tài khoản {email} đã được đăng nhập thành công!")
                return

            success = self.browser_manager.auto_login(email=email, password=password)
            if success:
                print(f"🎉 TỰ ĐỘNG ĐĂNG NHẬP THÀNH CÔNG: {email}")
                self.root.after(0, lambda: self.update_auth_ui(True))
                messagebox.showinfo("Đăng nhập thành công", f"Đã tự động đăng nhập thành công với tài khoản:\n{email}")
            else:
                print("⚠️ Tự động đăng nhập chưa thành công. Bạn có thể mở Chrome để đăng nhập trực tiếp.")
                self.root.after(0, lambda: self.update_auth_ui(False))
                messagebox.showerror("Đăng nhập thất bại", "Không thể tự động đăng nhập.\nVui lòng kiểm tra lại Email/Mật khẩu hoặc kiểm tra trình duyệt Chrome.")
        except Exception as e:
            print(f"❌ Lỗi tự động đăng nhập: {e}")
            self.root.after(0, lambda: self.update_auth_ui(False))
            messagebox.showerror("Lỗi", f"Lỗi trong quá trình đăng nhập: {e}")

    def check_login_status_async(self):
        """Kiểm tra trạng thái đăng nhập hiện tại trên Chrome."""
        threading.Thread(target=self._worker_check_login, daemon=True).start()

    def _worker_check_login(self):
        print("\n🔍 Đang kiểm tra trạng thái đăng nhập trên trình duyệt...")
        try:
            if not self.browser_manager.is_driver_alive():
                print("ℹ️ Trình duyệt Chrome chưa được mở.")
                self.root.after(0, lambda: self.update_auth_ui(False, "Chưa mở Chrome"))
                return

            curr = self.browser_manager.driver.current_url or ""
            if curr.startswith("data:") or curr.startswith("about:") or not curr:
                self.browser_manager.driver.get(BASE_URL)
                time.sleep(1.5)

            is_logged = self.browser_manager.is_logged_in()
            self.root.after(0, lambda: self.update_auth_ui(is_logged))
            if is_logged:
                print(f"✅ Đang đăng nhập tài khoản: {AUTH_CONFIG.get('email', '')}")
            else:
                print("⚠️ Hiện tại CHƯA ĐĂNG NHẬP trên trình duyệt.")
        except Exception as e:
            print(f"❌ Lỗi kiểm tra: {e}")

    def _open_chrome_manual(self):
        """Mở cửa sổ Chrome độc lập để người dùng đăng nhập tài khoản."""
        threading.Thread(target=self._worker_open_chrome, daemon=True).start()

    def _worker_open_chrome(self):
        print("\n🚀 Đang mở trình duyệt Chrome...")
        try:
            driver = self.browser_manager.setup_driver()
            driver.get(f"{BASE_URL.rstrip('/')}/register")
            time.sleep(1.5)

            if self.browser_manager.is_logged_in():
                print("✅ Trình duyệt đã nhận diện phiên đăng nhập sẵn!")
                self.root.after(0, lambda: self.update_auth_ui(True))
            elif self.auto_login_var.get() and self.email_var.get().strip() and self.pass_var.get().strip():
                print("🔐 Bật tự động đăng nhập khi mở Chrome -> Đang tự động điền...")
                if self.browser_manager.auto_login(self.email_var.get().strip(), self.pass_var.get().strip()):
                    self.root.after(0, lambda: self.update_auth_ui(True))
                else:
                    print("👉 Bạn có thể đăng nhập tài khoản trực tiếp trên trình duyệt!")
            else:
                print("✅ Trình duyệt đã mở. Bạn có thể đăng nhập tài khoản trực tiếp trên trình duyệt!")
        except Exception as e:
            print(f"❌ Không thể mở Chrome: {e}")

    def _save_settings(self):
        """Lưu cài đặt vào bộ nhớ phiên."""
        try:
            wpm = int(self.wpm_var.get())
            TIMING["reading_wpm"] = max(100, wpm)

            cb = float(self.chap_break_var.get()) / 100.0
            TIMING["chap_break_chance"] = min(1.0, max(0.0, cb))

            AUTH_CONFIG["auto_login"] = self.auto_login_var.get()
            AUTH_CONFIG["email"] = self.email_var.get().strip()
            AUTH_CONFIG["password"] = self.pass_var.get().strip()

            messagebox.showinfo("Cài đặt", "Đã lưu cấu hình thành công!")
            print("✅ Đã cập nhật cấu hình hệ thống.")
        except Exception as e:
            messagebox.showerror("Lỗi", f"Giá trị cấu hình không hợp lệ: {e}")

    # =========================================================================
    # QUẢN LÝ CHECKPOINT
    # =========================================================================

    def refresh_checkpoints(self):
        """Nạp danh sách các checkpoint vào bảng Treeview."""
        for item in self.tree_checkpoints.get_children():
            self.tree_checkpoints.delete(item)

        checkpoints = self.checkpoint_manager.list_checkpoints()
        for cp in checkpoints:
            st = cp.get("status", "Đang cập nhật")
            status_display = "🔄 Đang cập nhật" if st == "Đang cập nhật" else "✅ Hoàn thành"
            prog = f"{cp['crawled_count']}/{cp['total_count']}"
            if cp['total_count'] > 0:
                prog += f" ({cp['crawled_count']/cp['total_count']*100:.1f}%)"

            self.tree_checkpoints.insert(
                "",
                "end",
                iid=cp["slug"],
                values=(
                    cp["name"],
                    cp["author"],
                    status_display,
                    prog,
                    cp["saved_at"],
                    cp["slug"]
                )
            )

    def _get_selected_slug(self) -> str:
        """Lấy slug của dòng được chọn trong bảng checkpoint."""
        selected = self.tree_checkpoints.selection()
        if not selected:
            messagebox.showwarning("Cảnh báo", "Vui lòng chọn một truyện trong danh sách checkpoint trước!")
            return ""
        return selected[0]

    def check_selected_for_updates(self):
        """Kiểm tra cập nhật chương mới trên website cho truyện đã chọn."""
        slug = self._get_selected_slug()
        if not slug:
            return

        if self.is_crawling:
            messagebox.showwarning("Cảnh báo", "Tiến trình cào đang chạy. Vui lòng đợi hoặc dừng tiến trình trước!")
            return

        threading.Thread(target=self._worker_check_update, args=(slug,), daemon=True).start()

    def _worker_check_update(self, slug: str):
        self._set_crawling_state(True, "Đang kiểm tra cập nhật...")
        try:
            res = self.crawler.check_story_update(slug)
            self.root.after(0, self.refresh_checkpoints)
            if self.browser_manager.is_logged_in():
                self.root.after(0, lambda: self.update_auth_ui(True))

            if res.get("success"):
                name = res["name"]
                new_status = res["new_status"]
                old_status = res["old_status"]
                total = res["new_total"]
                done = res["crawled_count"]
                new_chaps = res["new_chapters_count"]

                msg = (
                    f"📖 Truyện: {name}\n"
                    f"📊 Trạng thái mới: {new_status} (Cũ: {old_status})\n"
                    f"📑 Tổng số chương web: {total} (Đã cào: {done})\n\n"
                )
                if new_chaps > 0:
                    msg += f"✨ PHÁT HIỆN {new_chaps} CHƯƠNG MỚI!\nBạn có muốn cào ngay các chương mới không?"
                    if messagebox.askyesno("Có chương mới!", msg):
                        self.root.after(0, lambda: self._start_crawl_slug(slug))
                else:
                    msg += "ℹ️ Hiện tại chưa có chương mới trên website."
                    messagebox.showinfo("Kết quả kiểm tra", msg)
            else:
                messagebox.showerror("Lỗi", res.get("message", "Kiểm tra thất bại."))
        finally:
            self._set_crawling_state(False)

    def resume_selected_checkpoint(self):
        """Bắt đầu cào tiếp tục truyện được chọn từ checkpoint."""
        slug = self._get_selected_slug()
        if not slug:
            return
        self.notebook.select(self.tab_crawler)
        self._start_crawl_slug(slug)

    def export_epub_from_selected(self):
        """Tạo file EPUB ngay lập tức từ dữ liệu checkpoint của truyện đã chọn."""
        slug = self._get_selected_slug()
        if not slug:
            return

        cp = self.checkpoint_manager.load(slug)
        if not cp or not cp.get("chapters"):
            messagebox.showwarning("Cảnh báo", "Checkpoint này chưa có nội dung chương nào!")
            return

        threading.Thread(target=self._worker_export_epub, args=(cp,), daemon=True).start()

    def _worker_export_epub(self, cp: dict):
        print(f"\n📚 Đang tạo file EPUB từ checkpoint '{cp['name']}'...")
        try:
            files = self.epub_builder.create_split_epub(
                name=cp["name"],
                author=cp.get("author", "Chưa rõ"),
                chapters=cp["chapters"],
                split_size=500,
                story_info=cp.get("story_info", {})
            )
            print(f"✅ Đã tạo thành công {len(files)} file EPUB:")
            for f in files:
                print(f"   📖 {f}")
            messagebox.showinfo("Thành công", f"Đã xuất thành công {len(files)} file EPUB vào thư mục ứng dụng!")
        except Exception as e:
            print(f"❌ Lỗi khi xuất EPUB: {e}")
            messagebox.showerror("Lỗi", f"Không thể xuất file EPUB: {e}")

    def delete_selected_checkpoint(self):
        """Xóa checkpoint đã chọn."""
        slug = self._get_selected_slug()
        if not slug:
            return

        cp = self.checkpoint_manager.load(slug)
        name = cp.get("name", slug) if cp else slug
        confirm = messagebox.askyesno("Xác nhận xóa", f"Bạn có chắc chắn muốn xóa checkpoint của truyện:\n'{name}'?\n(Dữ liệu cào dở của truyện này sẽ bị xóa khỏi máy)")
        if confirm:
            self.checkpoint_manager.delete(slug)
            self.refresh_checkpoints()
            print(f"🗑️ Đã xóa checkpoint '{slug}'.")

    # =========================================================================
    # ĐIỀU KHIỂN QUY TRÌNH CÀO
    # =========================================================================

    def _on_engine_changed(self):
        """Xử lý khi người dùng đổi chế độ cào giữa Chống Bot và WebToEpub."""
        engine = self.crawl_engine_var.get()
        if engine == "web2epub":
            if "20" in self.session_limit_var.get():
                self.session_limit_var.set("Không giới hạn (Crawl hết)")
            print("\n⚡ [CHUYỂN CHẾ ĐỘ] Đã chọn Chế độ Siêu Tốc WebToEpub:")
            print("   • Tự động cào liên tục không giới hạn thời gian đọc")
            print("   • Trích xuất DOM tức thì (~1s/chương)")
            print("   • Tự động đề xuất phiên: 'Không giới hạn (Crawl hết)'")
        else:
            if "Không giới hạn" in self.session_limit_var.get():
                self.session_limit_var.set("20 chương / phiên (Khuyên dùng)")
            print("\n🛡️ [CHUYỂN CHẾ ĐỘ] Đã chọn Chế độ Chống Bot:")
            print("   • Mô phỏng người đọc thật (WPM 650, cuộn đọc, nghỉ định kỳ chống ban IP)")
            print("   • Tự động đề xuất phiên: '20 chương / phiên'")

    def _parse_options(self):
        """Lấy các tùy chọn từ giao diện."""
        mode = self.mode_var.get()
        custom_chap = 20
        if mode == "3":
            try:
                custom_chap = int(self.custom_chap_var.get())
            except Exception:
                custom_chap = 20

        # Session limit
        session_text = self.session_limit_var.get()
        if "20" in session_text:
            session_limit = 20
        elif "50" in session_text:
            session_limit = 50
        elif "100" in session_text:
            session_limit = 100
        else:
            session_limit = None

        # Split size
        split_text = self.split_var.get()
        if "100" in split_text:
            split_size = 100
        elif "300" in split_text:
            split_size = 300
        elif "500" in split_text:
            split_size = 500
        elif "1000" in split_text:
            split_size = 1000
        else:
            split_size = 0

        engine = self.crawl_engine_var.get() if hasattr(self, 'crawl_engine_var') else "human"
        try:
            fast_delay = float(self.fast_delay_var.get())
        except Exception:
            fast_delay = 0.8

        return mode, custom_chap, session_limit, split_size, engine, fast_delay

    def start_crawling_from_input(self):
        """Bắt đầu cào từ ô input link."""
        raw_input = self.url_var.get().strip()
        if not raw_input:
            messagebox.showwarning("Cảnh báo", "Vui lòng dán link hoặc slug truyện trước!")
            return

        parts = [p.strip() for p in raw_input.split(",") if p.strip()]
        first_item = parts[0]
        slug = self.crawler.extract_slug(first_item)
        if not slug:
            messagebox.showerror("Lỗi", "Không nhận diện được slug truyện từ link đã nhập!")
            return

        story_url = first_item if first_item.startswith("http") else f"{BASE_URL.rstrip('/')}/stories/{slug}/"
        self._start_crawl_slug(slug, story_url=story_url)

    def _start_crawl_slug(self, slug: str, story_url: str = ""):
        """Khởi động luồng cào cho một slug cụ thể."""
        if self.is_crawling:
            messagebox.showwarning("Cảnh báo", "Tiến trình cào đang chạy!")
            return

        mode, custom_chap, session_limit, split_size, engine, fast_delay = self._parse_options()
        self.stop_requested = False
        if hasattr(self, 'crawler') and self.crawler:
            self.crawler.stop_requested = False
        if hasattr(self.human, "pause_controller") and self.human.pause_controller:
            self.human.pause_controller.stop_requested = False

        self.crawler_thread = threading.Thread(
            target=self._worker_crawl,
            args=(slug, mode, custom_chap, session_limit, split_size, engine, fast_delay, story_url),
            daemon=True
        )
        self.crawler_thread.start()

    def _worker_crawl(self, slug: str, mode: str, custom_chap: int, session_limit, split_size: int, engine: str = "human", fast_delay: float = 0.8, story_url: str = ""):
        self._set_crawling_state(True, f"Đang cào: {slug}")
        try:
            # 1. Xác định URL truyện từ tham số truyền vào hoặc checkpoint
            if not story_url:
                cp = self.checkpoint_manager.load(slug)
                if cp and cp.get("story_url"):
                    story_url = cp["story_url"]
                elif "http" in slug:
                    story_url = slug
                    slug = self.crawler.extract_slug(slug)
                else:
                    story_url = f"{BASE_URL.rstrip('/')}/stories/{slug}/"

            # 2. Đảm bảo khởi động và đăng nhập tự động (chỉ cho giatocvuongtai.com)
            is_giatoc = "giatocvuongtai.com" in story_url.lower()
            if is_giatoc:
                print("\n🔐 Đang kiểm tra phiên đăng nhập...")
                logged = self.browser_manager.ensure_logged_in(interactive=False)
                if logged:
                    print(f"✅ Đã đăng nhập tài khoản: {AUTH_CONFIG.get('email', '')}")
                    self.root.after(0, lambda: self.update_auth_ui(True))
                else:
                    print("⚠️ Cảnh báo: Chưa đăng nhập được tài khoản. Tiếp tục cào các chương công khai...")
                    self.root.after(0, lambda: self.update_auth_ui(False))
            else:
                print(f"\n🌐 Đang kết nối tới website: {story_url}")
                self.browser_manager.ensure_driver_alive()

            # 3. Cấu hình class cần xóa thủ công (nếu người dùng có nhập)
            crawl_custom_cls = self.crawler_custom_classes_var.get().strip()
            self.crawler.custom_classes_to_remove = crawl_custom_cls if crawl_custom_cls else None
            if crawl_custom_cls:
                print(f"🎯 [Chế độ thủ công] Sẽ chỉ xóa các phần tử có class: {crawl_custom_cls}")
            else:
                print("🤖 [Chế độ tự động] Tự động quét và loại bỏ các thẻ ẩn, honeypot, spam.")

            # 4. Tiến hành cào theo cơ chế đã chọn (Chống Bot hoặc Siêu Tốc WebToEpub)
            files = self.crawler.crawl_story(
                story_url=story_url,
                slug=slug,
                global_mode=mode,
                global_custom_chap=custom_chap,
                split_size=split_size,
                session_limit=session_limit,
                crawl_engine=engine,
                fast_delay=fast_delay
            )

            # Cập nhật lại bảng checkpoint
            self.root.after(0, self.refresh_checkpoints)

            if files:
                messagebox.showinfo("Thành công", f"Đã hoàn thành! Tạo {len(files)} file EPUB.")
            elif self.stop_requested or getattr(self.crawler, 'stop_requested', False):
                messagebox.showinfo("Đã dừng an toàn", "Tiến trình cào truyện đã dừng thành công!\nCheckpoint các chương đã cào được bảo toàn.")

        except Exception as e:
            print(f"\n❌ Lỗi trong quá trình cào: {e}")
            import traceback
            traceback.print_exc()
        finally:
            self._set_crawling_state(False)
            self.root.after(0, self.refresh_checkpoints)

    def _set_crawling_state(self, crawling: bool, status_text: str = ""):
        """Cập nhật trạng thái các nút bấm trên giao diện."""
        self.is_crawling = crawling

        def update():
            if crawling:
                self.status_badge.config(text="🔴 ĐANG CÀO TRUYỆN", bg="#ef4444")
                self.btn_start.config(state="disabled", bg="#94a3b8")
                self.btn_pause.config(state="normal", text="⏸️  TẠM DỪNG (Phím Cách)", bg="#f59e0b")
                self.btn_stop.config(state="normal")
                self.lbl_progress.config(text=f"Tiến độ: {status_text}")
                self.progress_bar.config(mode="indeterminate")
                self.progress_bar.start(15)
            else:
                self.status_badge.config(text="🟢 SẴN SÀNG", bg="#10b981")
                self.btn_start.config(state="normal", bg="#7c3aed")
                self.btn_pause.config(state="disabled", text="⏸️  TẠM DỪNG (Phím Cách)", bg="#94a3b8")
                self.btn_stop.config(state="disabled")
                self.lbl_progress.config(text="Tiến độ: Đã kết thúc phiên cào.")
                self.progress_bar.stop()
                self.progress_bar.config(mode="determinate", value=100)

        self.root.after(0, update)

    def toggle_pause(self):
        """Bật / Tắt tạm dừng."""
        if hasattr(self.human, "pause_controller") and self.human.pause_controller:
            self.human.pause_controller.toggle_pause()
            is_paused = self.human.pause_controller.is_paused
            if is_paused:
                self.btn_pause.config(text="▶️  TIẾP TỤC (Phím Cách)", bg="#10b981")
                self.status_badge.config(text="⏸️ TẠM DỪNG", bg="#f59e0b")
            else:
                self.btn_pause.config(text="⏸️  TẠM DỪNG (Phím Cách)", bg="#f59e0b")
                self.status_badge.config(text="🔴 ĐANG CÀO TRUYỆN", bg="#ef4444")

    def stop_crawling(self):
        """Yêu cầu dừng tiến trình và lưu checkpoint ngay."""
        confirm = messagebox.askyesno(
            "Dừng cào truyện",
            "Bạn có chắc chắn muốn dừng cào truyện không?\n\n"
            "• Tiến trình sẽ dừng lại ngay lập tức.\n"
            "• Checkpoint của các chương đã cào trước đó đã được lưu an toàn.\n"
            "• Hoàn toàn không cào thêm bất kỳ chương nào nữa."
        )
        if confirm:
            print("\n⏹️ [YÊU CẦU DỪNG] Đang yêu cầu dừng cào và chốt checkpoint...")
            self.stop_requested = True
            if hasattr(self, 'crawler') and self.crawler:
                self.crawler.request_stop()
            if hasattr(self.human, "pause_controller") and self.human.pause_controller:
                self.human.pause_controller.request_stop()
            self._set_crawling_state(False, "Đã yêu cầu dừng tiến trình.")

    # =========================================================================
    # XỬ LÝ LÀM SẠCH FILE EPUB ĐỊNH DẠNG LẠ
    # =========================================================================

    def _select_clean_epub_file(self):
        """Mở hộp thoại chọn 1 file EPUB."""
        path = filedialog.askopenfilename(
            title="Chọn File EPUB Cần Làm Sạch",
            filetypes=[("EPUB Files", "*.epub"), ("All Files", "*.*")]
        )
        if path:
            self.clean_epub_path_var.set(path)
            self.lbl_clean_status.config(
                text=f"📄 Đã chọn file: {os.path.basename(path)}",
                foreground="#0284c7"
            )

    def _select_clean_epub_dir(self):
        """Mở hộp thoại chọn cả thư mục chứa nhiều file EPUB."""
        folder = filedialog.askdirectory(title="Chọn Thư Mục Chứa Các File EPUB")
        if folder:
            self.clean_epub_path_var.set(folder)
            self.lbl_clean_status.config(
                text=f"📁 Đã chọn thư mục: {os.path.basename(folder) or folder}",
                foreground="#0284c7"
            )

    def _open_cleaned_folder(self):
        """Mở thư mục chứa file đã xử lý."""
        target = self.clean_epub_path_var.get().strip()
        if target:
            if os.path.isfile(target):
                folder = os.path.dirname(target)
            else:
                folder = target
        else:
            folder = os.getcwd()

        if os.path.exists(folder):
            os.system(f'explorer "{folder}"')

    def _start_clean_epub(self):
        """Kích hoạt tiến trình làm sạch EPUB trong worker thread độc lập."""
        target = self.clean_epub_path_var.get().strip()
        if not target:
            messagebox.showwarning("Chưa chọn file", "Vui lòng chọn file .epub hoặc thư mục chứa sách EPUB cần xử lý!")
            return

        if not os.path.exists(target):
            messagebox.showerror("Không tìm thấy", f"Đường dẫn không tồn tại:\n{target}")
            return

        self.btn_run_cleaner.config(state="disabled", text="⏳ ĐANG XỬ LÝ EPUB...")
        self.lbl_clean_status.config(text="🔄 Đang giải nén và quét sạch các thẻ ẩn trong EPUB...", foreground="#d97706")

        threading.Thread(target=self._worker_clean_epub, args=(target,), daemon=True).start()

    def _worker_clean_epub(self, target: str):
        """Worker thread xử lý dọn dẹp file EPUB."""
        try:
            files_to_process = []
            if os.path.isfile(target):
                if target.lower().endswith(".epub"):
                    files_to_process.append(target)
                else:
                    self.root.after(0, lambda: messagebox.showerror("Lỗi định dạng", "File được chọn không có đuôi mở rộng là .epub!"))
                    return
            elif os.path.isdir(target):
                for fname in os.listdir(target):
                    if fname.lower().endswith(".epub") and not fname.lower().endswith("_cleaned.epub"):
                        files_to_process.append(os.path.join(target, fname))

            if not files_to_process:
                self.root.after(0, lambda: messagebox.showwarning("Không có file", "Không tìm thấy file .epub nào để xử lý!"))
                return

            print("\n" + "=" * 65)
            print(f"🧹 BẮT ĐẦU XỬ LÝ LÀM SẠCH {len(files_to_process)} FILE EPUB...")
            print("=" * 65)

            grand_total_chapters = 0
            grand_total_hidden = 0
            grand_total_spam = 0
            last_output_file = ""

            custom_classes_raw = self.clean_custom_classes_var.get().strip() or None
            if custom_classes_raw:
                print(f"🎯 [Chế độ thủ công] Sẽ chỉ xóa các phần tử có class: {custom_classes_raw}")
            else:
                print("🤖 [Chế độ tự động] Tự động quét và loại bỏ các thẻ ẩn, honeypot, watermark.")

            for idx, epub_file in enumerate(files_to_process, 1):
                base_name = os.path.basename(epub_file)
                print(f"\n[{idx}/{len(files_to_process)}] 📖 Đang làm sạch: {base_name}")

                def log_cb(msg):
                    print(msg)

                st = EpubFileCleaner.clean_epub_file(
                    input_path=epub_file,
                    callback=log_cb,
                    custom_classes=custom_classes_raw
                )

                grand_total_chapters += st["chapters_processed"]
                grand_total_hidden += st["hidden_tags_removed"]
                grand_total_spam += st["spam_tags_removed"]
                last_output_file = st["output_file"]

                in_kb = st["input_size_bytes"] / 1024
                out_kb = st["output_size_bytes"] / 1024
                print(f"   ✅ Xong {base_name}:")
                print(f"      - Đã xử lý: {st['chapters_processed']} chương")
                print(f"      - Đã loại bỏ: {st['hidden_tags_removed']} thẻ ẩn/bẫy chống cào")
                print(f"      - Đã xóa: {st['spam_tags_removed']} đoạn watermark rác")
                print(f"      - Dung lượng: {in_kb:.1f} KB -> {out_kb:.1f} KB")
                print(f"      - File sạch: {os.path.basename(st['output_file'])}")

            print("\n" + "=" * 65)
            print(f"🎉 HOÀN TẤT TOÀN BỘ {len(files_to_process)} FILE EPUB!")
            print(f"   Tổng chương xử lý: {grand_total_chapters}")
            print(f"   Tổng thẻ ẩn đã diệt: {grand_total_hidden}")
            print(f"   Tổng rác watermark đã xóa: {grand_total_spam}")
            print("=" * 65 + "\n")

            summary_msg = (
                f"Đã xử lý xong {len(files_to_process)} file EPUB!\n\n"
                f"• Tổng số chương đã duyệt: {grand_total_chapters}\n"
                f"• Thẻ ẩn/honeypot đã loại bỏ: {grand_total_hidden}\n"
                f"• Watermark/lỗi hệ thống đã xóa: {grand_total_spam}\n\n"
                f"File sạch đã được lưu với hậu tố '_cleaned.epub'."
            )

            def update_ui_success():
                self.btn_run_cleaner.config(state="normal", text="🚀  BẮT ĐẦU XỬ LÝ & LÀM SẠCH EPUB")
                self.lbl_clean_status.config(
                    text=f"✅ HOÀN THÀNH: Đã làm sạch thành công {len(files_to_process)} file!",
                    foreground="#059669"
                )
                self.lbl_clean_details.config(
                    text=f"Đã diệt {grand_total_hidden} thẻ ẩn, {grand_total_spam} watermark rác trên {grand_total_chapters} chương. File: {os.path.basename(last_output_file)}"
                )
                messagebox.showinfo("Xử lý EPUB thành công", summary_msg)

            self.root.after(0, update_ui_success)

        except Exception as e:
            err_msg = str(e)
            print(f"\n❌ Lỗi trong quá trình làm sạch EPUB: {err_msg}")

            def update_ui_error():
                self.btn_run_cleaner.config(state="normal", text="🚀  BẮT ĐẦU XỬ LÝ & LÀM SẠCH EPUB")
                self.lbl_clean_status.config(
                    text=f"❌ Thất bại: {err_msg}",
                    foreground="#ef4444"
                )
                messagebox.showerror("Lỗi xử lý EPUB", f"Quá trình làm sạch gặp lỗi:\n{err_msg}")

            self.root.after(0, update_ui_error)


def run_gui():
    """Điểm khởi chạy ứng dụng GUI."""
    root = tk.Tk()
    app = CrawlerGUIApp(root)
    root.mainloop()


if __name__ == "__main__":
    run_gui()

