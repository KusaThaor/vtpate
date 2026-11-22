"""
Module xây dựng và xuất file định dạng EPUB từ dữ liệu truyện đã cào.
"""

import os
import re
import io
import time
from typing import List, Dict, Any, Optional, Tuple
import requests
from PIL import Image
from ebooklib import epub

from .config import EPUB_CSS


class EpubBuilder:
    """Xây dựng và đóng gói sách điện tử định dạng EPUB, hỗ trợ chia nhiều phần."""

    def __init__(self, css: str = EPUB_CSS):
        self.css = css

    @staticmethod
    def sanitize_filename(name: str) -> str:
        """Xóa các ký tự không hợp lệ trong tên file hệ điều hành."""
        return re.sub(r'[\\/*?:"<>|]', '_', name)

    def download_cover_image(self, url: str) -> Optional[bytes]:
        """Tải ảnh bìa và chuyển đổi sang JPEG bytes tương thích mọi máy đọc sách."""
        if not url:
            return None
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://giatocvuongtai.com/"
            }
            resp = requests.get(url, headers=headers, timeout=15)
            if resp.status_code == 200 and resp.content:
                img = Image.open(io.BytesIO(resp.content))
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=92)
                print("   🎨 Đã tải và tối ưu ảnh bìa (Cover) cho EPUB.")
                return buf.getvalue()
            else:
                print(f"   ⚠️ Không thể tải ảnh bìa (Status code: {resp.status_code})")
        except Exception as e:
            print(f"   ⚠️ Lỗi tải ảnh bìa: {e}")
        return None

    def create_epub(
        self,
        name: str,
        author: str,
        chapters: List[Dict[str, Any]],
        filename: str,
        part_info: Optional[Tuple[int, int, int, int]] = None,
        story_info: Optional[Dict[str, Any]] = None,
        cover_bytes: Optional[bytes] = None
    ) -> str:
        """Tạo 1 file EPUB hoàn chỉnh từ danh sách chương, tích hợp ảnh bìa và chương giới thiệu."""
        book = epub.EpubBook()

        # Metadata
        story_title = (story_info.get("name") if story_info else None) or name or "Unknown Story"
        story_author = (story_info.get("author") if story_info else None) or author or "Đang cập nhật"
        story_status = (story_info.get("status") if story_info else "Đang cập nhật") or "Đang cập nhật"
        contributors = (story_info.get("contributors") if story_info else []) or []
        summary_text = (story_info.get("summary") if story_info else "") or ""

        if part_info:
            part_num, total_parts, start_chap, end_chap = part_info
            book_title = f"{story_title} - Phần {part_num}/{total_parts} (Chương {start_chap}-{end_chap})"
        else:
            book_title = story_title

        book.set_title(book_title)
        book.add_author(story_author)
        book.set_language("vi")

        # Đóng ảnh bìa (Cover) nếu có
        if cover_bytes:
            book.set_cover("cover.jpg", cover_bytes, create_page=True)

        # Thêm stylesheet CSS
        css_item = epub.EpubItem(
            uid="style",
            file_name="style.css",
            media_type="text/css",
            content=self.css
        )
        book.add_item(css_item)

        # Xây dựng nội dung chương giới thiệu (Intro)
        now_str = time.strftime('%d/%m/%Y %H:%M:%S')

        # Format Đội ngũ thực hiện / Editor
        contributors_html = ""
        if contributors:
            contrib_items = []
            for c in contributors:
                if ":" in c:
                    role_str, name_str = c.split(":", 1)
                    contrib_items.append(f"<p><strong>{role_str.strip()}:</strong> {name_str.strip()}</p>")
                else:
                    contrib_items.append(f"<p><strong>Đội ngũ thực hiện:</strong> {c.strip()}</p>")
            contributors_html = "".join(contrib_items)

        # Format Thông tin phần
        if part_info:
            part_num, total_parts, start_chap, end_chap = part_info
            part_html = f"""
                <p><strong>Phần:</strong> {part_num}/{total_parts}</p>
                <p><strong>Chương:</strong> {start_chap} - {end_chap}</p>
                <p><strong>Số chương phần này:</strong> {len(chapters)}</p>
            """
        else:
            part_html = f"<p><strong>Tổng số chương:</strong> {len(chapters)}</p>"

        # Format Văn án (Summary)
        summary_html = ""
        if summary_text:
            p_tags = []
            for line in summary_text.splitlines():
                clean_line = line.strip()
                if not clean_line:
                    continue
                if set(clean_line) in [{'-'}, {'*'}, {'_'}, {'='}] and len(clean_line) >= 3:
                    p_tags.append("<hr/>")
                else:
                    p_tags.append(f"<p>{clean_line}</p>")
            summary_html = "".join(p_tags)
        else:
            summary_html = "<p><em>Đang cập nhật văn án.</em></p>"

        intro = epub.EpubHtml(title="Giới thiệu", file_name="intro.xhtml", uid="intro")
        intro.content = f"""<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="utf-8"/>
    <title>Giới thiệu - {story_title}</title>
    <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
    <div class="intro-container">
        <h1 class="intro-title">{story_title}</h1>
        <div class="intro-meta">
            <p><strong>Tác giả:</strong> {story_author}</p>
            <p><strong>Trạng thái:</strong> {story_status}</p>
            {contributors_html}
            {part_html}
            <p><strong>Ngày xuất bản EPUB:</strong> {now_str}</p>
        </div>
        <div class="intro-summary-section">
            <h2>Văn án &amp; Giới thiệu tác phẩm</h2>
            <div class="intro-summary-content">
                {summary_html}
            </div>
        </div>
    </div>
</body>
</html>"""
        intro.add_item(css_item)
        book.add_item(intro)

        epub_chapters = [intro]
        nav_points = []

        from .format_processor import ContentFormatCleaner

        # Tạo từng chương XHTML
        for chap in chapters:
            safe_uid = f"chap_{chap['num']:05d}"
            chap_title = chap['title'][:80] if chap.get('title') else f"Chương {chap['num']}"
            raw_content = chap.get('content', '')

            # Chuẩn hóa, loại bỏ thẻ ẩn, không xóa link và bổ sung pass cho chương trống
            clean_content, _ = ContentFormatCleaner.clean_html_content(raw_content, remove_spam=True)
            if not clean_content or not clean_content.strip():
                clean_content = "<p>pass</p>"

            chap_html = epub.EpubHtml(
                title=chap_title,
                file_name=f"chap_{chap['num']:05d}.xhtml",
                uid=safe_uid
            )
            chap_html.content = f"""<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="utf-8"/>
    <title>{chap.get('title', '')}</title>
    <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
    <h2>{chap.get('title', '')}</h2>
    {clean_content}
</body>
</html>"""
            chap_html.add_item(css_item)
            book.add_item(chap_html)
            epub_chapters.append(chap_html)
            nav_points.append(chap_html)

        # Cấu hình mục lục (TOC & Spine)
        book.toc = [
            epub.Link('intro.xhtml', 'Giới thiệu', 'intro'),
            (epub.Section('Danh sách chương'), nav_points)
        ]
        book.add_item(epub.EpubNcx())
        book.add_item(epub.EpubNav())

        if cover_bytes:
            book.spine = ['cover'] + epub_chapters
        else:
            book.spine = epub_chapters

        epub.write_epub(filename, book, {})
        print(f"✅ Đã tạo: {filename}")
        return filename

    def create_split_epub(
        self,
        name: str,
        author: str,
        chapters: List[Dict[str, Any]],
        split_size: int = 0,
        story_info: Optional[Dict[str, Any]] = None
    ) -> List[str]:
        """Tạo các file EPUB (có thể chia nhỏ theo split_size), kèm ảnh bìa và văn án."""
        files = []
        total = len(chapters)
        safe_name = self.sanitize_filename(name)

        # Lấy ảnh bìa từ file đã lưu hoặc tải về nếu chưa có
        cover_bytes = None
        if story_info and story_info.get("cover_path") and os.path.exists(story_info["cover_path"]):
            try:
                with open(story_info["cover_path"], "rb") as fc:
                    cover_bytes = fc.read()
            except Exception:
                cover_bytes = None

        if not cover_bytes and story_info and story_info.get("cover_url"):
            cover_bytes = self.download_cover_image(story_info["cover_url"])

        # Trường hợp không chia hoặc tổng số chương nhỏ hơn kích thước chia
        if split_size <= 0 or total <= split_size:
            filename = f"{safe_name}.epub"
            if os.path.exists(filename):
                filename = f"{safe_name}_{int(time.time())}.epub"
            return [self.create_epub(
                name=name,
                author=author,
                chapters=chapters,
                filename=filename,
                story_info=story_info,
                cover_bytes=cover_bytes
            )]

        total_parts = (total + split_size - 1) // split_size

        for part_idx in range(total_parts):
            start = part_idx * split_size
            end = min(start + split_size, total)
            part_chaps = chapters[start:end]

            part_num = part_idx + 1
            start_chap = part_chaps[0]['num']
            end_chap = part_chaps[-1]['num']

            filename = f"{safe_name} - Phần {part_num:02d} (Chương {start_chap}-{end_chap}).epub"
            if os.path.exists(filename):
                filename = f"{safe_name} - Phần {part_num:02d}_{int(time.time())}.epub"

            part_info = (part_num, total_parts, start_chap, end_chap)
            self.create_epub(
                name=name,
                author=author,
                chapters=part_chaps,
                filename=filename,
                part_info=part_info,
                story_info=story_info,
                cover_bytes=cover_bytes
            )
            files.append(filename)

        return files

