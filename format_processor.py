"""
Module chuyên sâu xử lý, dọn dẹp và chuẩn hóa các file EPUB hoặc nội dung chương có định dạng lạ:
- Phát hiện và loại bỏ triệt để các thẻ ẩn (hidden <p>, display:none, visibility:hidden, opacity:0, font-size:0, off-screen text, v.v.).
- Lọc bỏ bẫy chống bot, honeypot, watermark tàng hình, ký tự khoảng trắng zero-width.
- Chuẩn hóa các định dạng phi chuẩn (không có thẻ <p>, dùng nhiều thẻ <br>, lồng thẻ vô tội vạ).
- Xóa các inline style ép màu sắc/nền làm hỏng giao diện Dark Mode trên máy đọc sách.
- Hỗ trợ làm sạch trực tiếp từ chuỗi HTML, từ Checkpoint hoặc quét và đóng gói lại cả file .epub có sẵn.
"""

import os
import re
import io
import zipfile
from typing import List, Dict, Any, Tuple, Optional
from bs4 import BeautifulSoup, Tag, NavigableString


# Danh sách ký tự vô hình / zero-width phổ biến dùng để chèn watermark hoặc chống cào
ZERO_WIDTH_CHARS = [
    '\u200b',  # Zero width space
    '\u200c',  # Zero width non-joiner
    '\u200d',  # Zero width joiner
    '\u2060',  # Word joiner
    '\ufeff',  # Zero width no-break space / BOM
    '\u00ad',  # Soft hyphen
    '\u200e',  # Left-to-right mark
    '\u200f',  # Right-to-left mark
]

# Các mẫu watermark hoặc thông báo lỗi hệ thống / bẫy cào cần loại bỏ
DEFAULT_SPAM_PATTERNS = [
    r'mọi\s+khoảnh\s+khắc\s+chăm\s+sóc.*không\s+gian\s+riêng',
    r'không\s+thể\s+tải\s+lịch\s+hẹn',
    r'phiên\s+đăng\s+nhập\s+không\s+hợp\s+lệ\s+hoặc\s+đã\s+hết\s+hạn',
    r'đăng\s+nhập\s+lại\s+để\s+tiếp\s+tục',
    r'truyện\s+(được\s+)?(đăng\s+tải|chia\s+sẻ|phát\s+hành)\s+(duy\s+nhất\s+)?tại',
    r'chúc\s+bạn\s+đọc\s+truyện\s+vui\s+vẻ',
    r'ủng\s+hộ\s+nhóm\s+dịch\s+tại',
    r'click\s+quảng\s+cáo\s+để\s+ủng\s+hộ',
    r'nội\s+dung\s+cần\s+lấy',
]


class ContentFormatCleaner:
    """Bộ xử lý làm sạch và chuẩn hóa nội dung văn bản HTML."""

    @staticmethod
    def normalize_class_list(classes_input: Any) -> set:
        """Chuẩn hóa danh sách class nhập vào từ người dùng thành set các class viết thường."""
        if not classes_input:
            return set()
        if isinstance(classes_input, str):
            parts = re.split(r'[,;\s]+', classes_input)
            return {p.strip().lower() for p in parts if p.strip()}
        if isinstance(classes_input, (list, tuple, set)):
            res = set()
            for item in classes_input:
                if isinstance(item, str):
                    for p in re.split(r'[,;\s]+', item):
                        if p.strip():
                            res.add(p.strip().lower())
            return res
        return set()

    @classmethod
    def is_hidden_element(cls, tag: Tag, custom_classes: Optional[set] = None) -> bool:
        """
        Kiểm tra xem một thẻ HTML có phải là thẻ cần loại bỏ hay không.
        - Nếu có custom_classes (Chế độ thủ công): CHỈ xóa nếu thẻ (hoặc thẻ cha) có class thuộc custom_classes.
        - Nếu không có custom_classes (Chế độ tự động): Quét đa chiều CSS ẩn, class ẩn, bẫy chống bot, tọa độ ngoài màn hình.
        """
        if not tag or not hasattr(tag, 'attrs'):
            return False

        # =====================================================================
        # 1. CHẾ ĐỘ THỦ CÔNG: Người dùng tự điền class cần xóa -> CHỈ XÓA ĐÚNG CLASS ĐÓ
        # =====================================================================
        if custom_classes:
            classes = tag.get('class', [])
            if isinstance(classes, str):
                classes = classes.split()
            tag_classes_lower = {c.lower() for c in classes}
            if tag_classes_lower & custom_classes:
                return True
            for parent in tag.parents:
                if parent and hasattr(parent, 'attrs'):
                    p_classes = parent.get('class', [])
                    if isinstance(p_classes, str):
                        p_classes = p_classes.split()
                    if {c.lower() for c in p_classes} & custom_classes:
                        return True
            return False

        # =====================================================================
        # 2. CHẾ ĐỘ TỰ ĐỘNG: Không điền class -> Tự động nhận diện toàn diện
        # =====================================================================
        # 2.1 Thuộc tính hidden HTML5 hoặc aria-hidden
        if tag.has_attr('hidden'):
            return True
        if tag.get('aria-hidden') == 'true':
            return True

        # 2.2 Quét class ẩn phổ biến
        classes = tag.get('class', [])
        if isinstance(classes, str):
            classes = classes.split()
        classes_lower = {c.lower() for c in classes}
        hidden_class_keywords = {
            'hidden', 'invisible', 'sr-only', 'visually-hidden',
            'd-none', 'hide', 'honeypot', 'anti-bot', 'watermark-hidden',
            'reader-hidden', 'secret-text'
        }
        if any(c in hidden_class_keywords for c in classes_lower):
            return True

        # 2.3 Quét inline style CSS
        style = tag.get('style', '').lower().replace(' ', '')
        if style:
            # display: none
            if 'display:none' in style:
                return True
            # visibility: hidden
            if 'visibility:hidden' in style:
                return True
            # opacity: 0
            if re.search(r'opacity:0(?![0-9\.])', style):
                return True
            # font-size: 0
            if re.search(r'font-size:0', style):
                return True
            # color: transparent
            if 'color:transparent' in style or 'color:rgba(0,0,0,0)' in style:
                return True
            # Tọa độ đẩy ra khỏi màn hình (position: absolute; left: -9999px hoặc top: -9999px)
            if 'position:absolute' in style or 'position:fixed' in style:
                if re.search(r'(left|top|right|bottom):-[0-9]{3,}', style):
                    return True
            # text-indent: -9999px
            if re.search(r'text-indent:-[0-9]{3,}', style):
                return True
            # height: 0 hoặc max-height: 0 kèm overflow: hidden
            if 'overflow:hidden' in style and (re.search(r'(max-)?height:0', style)):
                return True

        # 2.4 Kiểm tra nếu có thẻ cha nào đang bị ẩn
        for parent in tag.parents:
            if parent and hasattr(parent, 'attrs'):
                p_style = parent.get('style', '').lower().replace(' ', '')
                if 'display:none' in p_style or 'visibility:hidden' in p_style:
                    return True
                p_classes = parent.get('class', [])
                if isinstance(p_classes, str):
                    p_classes = p_classes.split()
                if any(c.lower() in hidden_class_keywords for c in p_classes):
                    return True

        return False

    @staticmethod
    def clean_text_string(text: str) -> str:
        """Lọc bỏ ký tự zero-width, chuẩn hóa dấu gạch ngang thoại và khoảng trắng."""
        if not text:
            return ""

        # Xóa toàn bộ ký tự zero-width
        for ch in ZERO_WIDTH_CHARS:
            text = text.replace(ch, '')

        # Chuẩn hóa khoảng trắng Unicode thừa
        text = text.replace('\xa0', ' ').replace('\u3000', ' ')
        text = re.sub(r'[ \t]+', ' ', text)

        # Chuẩn hóa gạch ngang thoại đầu câu (— hoặc - )
        text = re.sub(r'^[—–-]{2,}\s*', '— ', text.strip())

        return text.strip()

    @classmethod
    def clean_html_content(
        cls,
        raw_html: str,
        remove_spam: bool = True,
        custom_classes: Any = None
    ) -> Tuple[str, Dict[str, int]]:
        """
        Làm sạch toàn diện chuỗi HTML chương truyện:
        1. Xóa bỏ thẻ rác (<script>, <style>, <iframe>, <button>, <input>,...).
        2. Quét và loại bỏ các thẻ cần xóa:
           - Nếu có custom_classes (Chế độ thủ công): CHỈ xóa các phần tử có class người dùng chỉ định.
           - Nếu không có custom_classes (Chế độ tự động): Tự động nhận diện toàn bộ thẻ ẩn, honeypot.
        3. Chuẩn hóa định dạng: chuyển các thẻ lạ, thẻ br liên tiếp thành <p> chuẩn.
        4. Giữ nguyên link đã chèn (thẻ <a> với thuộc tính href), không xóa link.
        5. Xóa inline style ép màu (tránh hỏng Dark Mode trên máy đọc sách).
        6. Lọc bỏ các đoạn thông báo rác / watermark.
        7. Nếu chương không có thẻ <p> hoặc nội dung trống: Tự động bổ sung chữ pass (<p>pass</p>).
        """
        stats = {
            "hidden_tags_removed": 0,
            "spam_tags_removed": 0,
            "paragraphs_count": 0,
            "empty_tags_removed": 0,
            "is_pass_chapter": False,
        }

        if not raw_html or not raw_html.strip():
            return "<p>pass</p>", stats

        soup = BeautifulSoup(raw_html, "html.parser")
        target_classes = cls.normalize_class_list(custom_classes)

        # 1. Xóa các thẻ nhúng mã hoặc giao diện không thuộc nội dung
        for junk in soup(['script', 'style', 'iframe', 'noscript', 'canvas', 'svg', 'form', 'button', 'input', 'select']):
            junk.decompose()

        # 2. Xóa các thẻ ẩn hoặc thẻ khớp với class thủ công
        all_tags = list(soup.find_all(True))
        for tag in all_tags:
            if tag and tag.parent and cls.is_hidden_element(tag, custom_classes=target_classes):
                tag.decompose()
                stats["hidden_tags_removed"] += 1

        # 3. Thu thập hoặc tái cấu trúc các đoạn văn (<p>)
        cleaned_paragraphs = []
        p_elements = soup.find_all('p')

        if len(p_elements) >= 2:
            # Truyện đã chia theo thẻ <p>
            for p in p_elements:
                clean_p_text = cls.clean_text_string(p.get_text())
                if not clean_p_text:
                    stats["empty_tags_removed"] += 1
                    continue

                # Kiểm tra spam / thông báo lỗi / watermark
                if remove_spam:
                    is_spam = False
                    for pattern in DEFAULT_SPAM_PATTERNS:
                        if re.search(pattern, clean_p_text, re.IGNORECASE):
                            is_spam = True
                            break
                    if is_spam:
                        stats["spam_tags_removed"] += 1
                        continue

                # Giữ lại các thẻ in đậm, in nghiêng và LINK ĐÃ CHÈN (<a>)
                inner_html = cls._sanitize_inline_tags(p)
                if inner_html:
                    cleaned_paragraphs.append(f"<p>{inner_html}</p>")
        else:
            # Trường hợp định dạng lạ: Không dùng thẻ <p>, dùng thẻ <br> hoặc text tự do
            for br in soup.find_all(['br', 'hr']):
                br.replace_with("\n")

            full_text = soup.get_text()
            lines = full_text.splitlines()

            for line in lines:
                clean_line = cls.clean_text_string(line)
                if not clean_line:
                    continue

                if remove_spam:
                    is_spam = False
                    for pattern in DEFAULT_SPAM_PATTERNS:
                        if re.search(pattern, clean_line, re.IGNORECASE):
                            is_spam = True
                            break
                    if is_spam:
                        stats["spam_tags_removed"] += 1
                        continue

                safe_line = cls._escape_html(clean_line)
                cleaned_paragraphs.append(f"<p>{safe_line}</p>")

        # Nếu nội dung trống (không có thẻ p) -> Bổ sung chữ pass vào chương đó
        if not cleaned_paragraphs:
            cleaned_paragraphs.append("<p>pass</p>")
            stats["paragraphs_count"] = 1
            stats["is_pass_chapter"] = True
        else:
            stats["paragraphs_count"] = len(cleaned_paragraphs)

        return "\n".join(cleaned_paragraphs), stats

    @classmethod
    def _sanitize_inline_tags(cls, p_tag: Tag) -> str:
        """Giữ lại các thẻ con an toàn, KHÔNG xóa link đã chèn (<a>) và xóa style ép màu sắc."""
        allowed_tags = {'strong', 'b', 'em', 'i', 'u', 's', 'span', 'small', 'a'}
        for child in list(p_tag.find_all(True)):
            if child.name not in allowed_tags:
                child.unwrap()
            else:
                # Xóa style ép màu font chữ và màu nền để thân thiện với Dark Mode
                if child.has_attr('style'):
                    s = child['style'].lower()
                    # Giữ font-weight hoặc font-style, xóa color và background
                    new_s = re.sub(r'(color|background(-color)?)\s*:[^;]+;?', '', s)
                    if new_s.strip():
                        child['style'] = new_s.strip()
                    else:
                        del child['style']

                # Với thẻ <a>: Giữ nguyên link đã chèn (href, title, target, rel), không được xóa
                if child.name == 'a':
                    for attr in list(child.attrs.keys()):
                        if attr not in ('href', 'title', 'target', 'style', 'class', 'rel'):
                            del child[attr]

        inner = p_tag.decode_contents().strip()
        # Xóa các ký tự zero-width trong inner HTML
        for ch in ZERO_WIDTH_CHARS:
            inner = inner.replace(ch, '')
        return inner

    @staticmethod
    def _escape_html(text: str) -> str:
        """Escape an toàn cho các ký tự đặc biệt."""
        return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


class EpubFileCleaner:
    """Xử lý và dọn dẹp trực tiếp các file .epub có sẵn trên đĩa."""

    @classmethod
    def clean_epub_file(
        cls,
        input_path: str,
        output_path: Optional[str] = None,
        callback: Optional[callable] = None,
        custom_classes: Any = None
    ) -> Dict[str, Any]:
        """
        Đọc file EPUB, giải nén trong bộ nhớ, quét sạch các thẻ cần xóa,
        bảo tồn link đã chèn (<a>), bổ sung chữ pass cho chương rỗng và đóng gói lại thành file EPUB chuẩn.
        - Nếu custom_classes được cung cấp: CHỈ xóa các phần tử có class đó.
        - Nếu custom_classes rỗng: Tự động phát hiện và loại bỏ các thẻ ẩn, honeypot.
        """
        if not os.path.exists(input_path):
            raise FileNotFoundError(f"Không tìm thấy file: {input_path}")

        if not output_path:
            base, ext = os.path.splitext(input_path)
            output_path = f"{base}_cleaned{ext}"

        total_stats = {
            "chapters_processed": 0,
            "hidden_tags_removed": 0,
            "spam_tags_removed": 0,
            "empty_pass_chapters": 0,
            "input_file": input_path,
            "output_file": output_path,
            "input_size_bytes": os.path.getsize(input_path),
            "output_size_bytes": 0,
        }

        # Đọc toàn bộ các file trong EPUB (dạng zip)
        with zipfile.ZipFile(input_path, 'r') as zin:
            with zipfile.ZipFile(output_path, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
                # 1. Đảm bảo file 'mimetype' luôn được ghi đầu tiên và không nén (chuẩn EPUB)
                if 'mimetype' in zin.namelist():
                    mimetype_content = zin.read('mimetype')
                    zout.writestr('mimetype', mimetype_content, compress_type=zipfile.ZIP_STORED)

                file_list = zin.namelist()
                for item_name in file_list:
                    if item_name == 'mimetype':
                        continue

                    data = zin.read(item_name)

                    # 2. Nếu là file HTML/XHTML (nội dung chương) -> Thực hiện làm sạch
                    is_html = item_name.lower().endswith(('.xhtml', '.html', '.htm'))
                    if is_html and 'intro' not in item_name.lower() and 'cover' not in item_name.lower():
                        try:
                            html_str = data.decode('utf-8', errors='replace')
                            soup = BeautifulSoup(html_str, 'html.parser')

                            # Tìm phần body hoặc phần chứa văn bản
                            body = soup.find('body')
                            if body:
                                # Trích xuất tiêu đề h1/h2 nếu có
                                heading = body.find(['h1', 'h2', 'h3'])
                                heading_html = str(heading) if heading else ""
                                if heading:
                                    heading.decompose()

                                # Làm sạch phần còn lại (hỗ trợ xóa theo class thủ công hoặc tự động)
                                clean_body_html, st = ContentFormatCleaner.clean_html_content(
                                    str(body),
                                    remove_spam=True,
                                    custom_classes=custom_classes
                                )
                                total_stats["chapters_processed"] += 1
                                total_stats["hidden_tags_removed"] += st.get("hidden_tags_removed", 0)
                                total_stats["spam_tags_removed"] += st.get("spam_tags_removed", 0)
                                if st.get("is_pass_chapter"):
                                    total_stats["empty_pass_chapters"] += 1

                                if not clean_body_html or not clean_body_html.strip():
                                    clean_body_html = "<p>pass</p>"

                                # Ghép lại body sạch
                                new_body_content = ""
                                if heading_html:
                                    new_body_content += f"{heading_html}\n"
                                new_body_content += clean_body_html
                                body.clear()
                                body.append(BeautifulSoup(new_body_content, 'html.parser'))

                                new_data = str(soup).encode('utf-8')
                                zout.writestr(item_name, new_data)
                                if callback:
                                    tag_info = f"loại {st['hidden_tags_removed']} thẻ" if st['hidden_tags_removed'] > 0 else "định dạng chuẩn"
                                    if st.get("is_pass_chapter"):
                                        tag_info += " [chương rỗng -> pass]"
                                    callback(f"   Đã dọn dẹp: {item_name} ({tag_info})")
                                continue
                        except Exception as e:
                            # Nếu có lỗi giải mã, ghi lại file gốc
                            pass

                    # Ghi lại file không phải nội dung hoặc file không bị lỗi
                    zout.writestr(item_name, data)

        total_stats["output_size_bytes"] = os.path.getsize(output_path)
        return total_stats

