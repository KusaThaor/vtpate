"""
Module phụ trách cào dữ liệu truyện, danh sách chương và nội dung từng chương.
"""

import os
import re
import time
import random
from typing import List, Dict, Any, Tuple, Optional
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from .config import BASE_URL
from .browser import BrowserManager, HumanBehavior
from .checkpoint import CheckpointManager
from .epub_builder import EpubBuilder
from .special_parsers import InkittSpecialParser, WattpadSpecialParser
from .site_parser import (
    SiteParserManager,
    SiteParserConfig,
    FALLBACK_STORY_TITLE,
    FALLBACK_AUTHOR,
    FALLBACK_COVER,
    FALLBACK_SUMMARY,
    FALLBACK_CHAPTER_LIST,
    FALLBACK_NEXT_PAGE,
    FALLBACK_CHAPTER_TITLE,
    FALLBACK_CHAPTER_CONTENT,
)


class StoryCrawler:
    """Điều phối cào dữ liệu truyện từ website giatocvuongtai.com hoặc các trang web tùy biến (WebToEpub style)."""

    def __init__(
        self,
        browser_manager: BrowserManager,
        human: HumanBehavior,
        checkpoint_manager: CheckpointManager,
        epub_builder: EpubBuilder,
        base_url: str = BASE_URL,
        parser_manager: Optional[SiteParserManager] = None
    ):
        self.browser_manager = browser_manager
        self.human = human
        self.checkpoint_manager = checkpoint_manager
        self.epub_builder = epub_builder
        self.base_url = base_url
        self.stop_requested = False
        self.parser_manager = parser_manager or SiteParserManager()
        self.active_custom_parser: Optional[SiteParserConfig] = None
        self.custom_classes_to_remove: Optional[str] = None
        self.failed_chapters: List[Dict[str, Any]] = []
        import requests
        self.http_session = requests.Session()

    def request_stop(self):
        """Yêu cầu dừng cào an toàn ngay lập tức."""
        self.stop_requested = True
        if hasattr(self.human, 'pause_controller') and self.human.pause_controller:
            self.human.pause_controller.request_stop()

    @property
    def driver(self):
        return self.browser_manager.driver

    @staticmethod
    def extract_slug(input_str: str) -> str:
        """Tách slug từ URL truyện hoặc giữ nguyên nếu là slug thuần."""
        input_str = input_str.strip()
        if InkittSpecialParser.can_handle(input_str):
            s_id = InkittSpecialParser.extract_story_id(input_str)
            return f"inkitt_{s_id}" if s_id else "inkitt_story"
        if WattpadSpecialParser.can_handle(input_str):
            s_id = WattpadSpecialParser.resolve_story_id(input_str)
            return f"wattpad_{s_id}" if s_id else "wattpad_story"
        if "http" in input_str:
            match = re.search(r'/stories/([^/?#]+)', input_str)
            if match:
                return match.group(1)
            try:
                parsed_path = urlparse(input_str).path.strip('/')
                parts = [p for p in parsed_path.split('/') if p]
                if parts:
                    return parts[-1]
            except Exception:
                pass
        return input_str

    def get_story_info(self, story_url: str) -> Dict[str, Any]:
        """
        Lấy thông tin chi tiết truyện từ trang chủ:
        - Tên truyện, tác giả, đội ngũ, văn án, ảnh bìa, thống kê.
        - Hỗ trợ cả selector chuẩn Gia Tộc Vượng Tài lẫn selector tùy biến (Custom Site Parser).
        """
        if InkittSpecialParser.can_handle(story_url):
            print("   📖 Nhận diện truyện Inkitt: Sử dụng InkittSpecialParser...")
            return InkittSpecialParser.fetch_story_info(story_url, driver=self.driver)

        if WattpadSpecialParser.can_handle(story_url):
            print("   📖 Nhận diện truyện Wattpad: Sử dụng WattpadSpecialParser...")
            return WattpadSpecialParser.fetch_story_info(story_url, driver=self.driver)

        self.browser_manager.ensure_driver_alive()
        self.driver.get(story_url)
        self.human.delay(2.0, 4.0)
        self.human.scroll(self.driver, duration=random.uniform(1.5, 3.0), read_mode=False)

        soup = BeautifulSoup(self.driver.page_source, "html.parser")
        domain = self.parser_manager.get_domain(story_url)
        is_giatoc = ("giatocvuongtai.com" in domain) or ("giatocvuongtai.com" in story_url.lower())
        parser = self.active_custom_parser or self.parser_manager.get_parser(story_url)

        # Nếu là website riêng (không phải Vượng Tài) và chưa cấu hình selector, tự động phân tích DOM ngay
        if not is_giatoc and (not parser.story_title_sel or not parser.chapter_list_sel):
            print(f"   🔍 Nhận diện website riêng [{domain}]: Đang tự động phân tích cấu trúc HTML...")
            try:
                auto_cfg = self.parser_manager.auto_detect_from_html(self.driver.page_source, domain=domain)
                if auto_cfg.story_title_sel or auto_cfg.chapter_list_sel:
                    self.parser_manager.save_parser(auto_cfg)
                    parser = auto_cfg
                    self.active_custom_parser = parser
                    print(f"   ✅ Đã tự động tạo profile cấu hình riêng cho [{domain}]!")
            except Exception as e:
                print(f"   ⚠️ Lỗi tự động nhận diện DOM: {e}")

        # 1. Tên truyện
        name = ""
        if parser.story_title_sel:
            t_el = soup.select_one(parser.story_title_sel)
            if t_el:
                name = t_el.get_text(strip=True)
        if not name and is_giatoc:
            title_elem = soup.select_one("h1.detail-title, h1.detail-hero-title")
            if title_elem:
                name = title_elem.get_text(strip=True)
        if not name:
            for sel in FALLBACK_STORY_TITLE:
                t_el = soup.select_one(sel)
                if t_el:
                    txt = t_el.get("content") if t_el.name == "meta" else t_el.get_text(strip=True)
                    if txt and len(txt) > 1:
                        name = txt
                        break
        if not name:
            name = "Unknown Story"

        # 2. Tác giả
        author = "Đang cập nhật"
        if parser.author_sel:
            a_el = soup.select_one(parser.author_sel)
            if a_el:
                author = a_el.get_text(strip=True)
        if author == "Đang cập nhật" and is_giatoc:
            byline = soup.select_one(".detail-byline__item strong") or soup.select_one(".detail-byline__item")
            if byline:
                raw_byline = byline.get_text(strip=True).replace("Tác giả", "").strip()
                if raw_byline:
                    author = raw_byline
            else:
                old_author = soup.select_one(".detail-stat-card--author a")
                if old_author:
                    author = old_author.get_text(strip=True)
        if author == "Đang cập nhật":
            for sel in FALLBACK_AUTHOR:
                a_el = soup.select_one(sel)
                if a_el:
                    txt = a_el.get("content") if a_el.name == "meta" else a_el.get_text(strip=True)
                    if txt and len(txt) > 1 and "chương" not in txt.lower():
                        author = txt.replace("Tác giả:", "").replace("Tác giả", "").strip()
                        break

        # 3. Đội ngũ thực hiện / Editor (chỉ áp dụng cho Gia Tộc Vượng Tài nếu có)
        contributors = []
        if is_giatoc:
            contributors_panel = soup.select_one(".detail-contributors-panel")
            if contributors_panel:
                for group in contributors_panel.select(".detail-contributor-group"):
                    role_el = group.select_one("small")
                    name_el = group.select_one(".detail-contributor-names")
                    if role_el and name_el:
                        r = role_el.get_text(strip=True)
                        n = name_el.get_text(strip=True)
                        if n:
                            contributors.append(f"{r}: {n}")
                for person in contributors_panel.select(".detail-contributor-person"):
                    role_el = person.select_one("small")
                    name_el = person.select_one("strong")
                    if role_el and name_el:
                        r = role_el.get_text(strip=True)
                        n = name_el.get_text(strip=True)
                        entry = f"{r}: {n}"
                        if entry not in contributors and n:
                            contributors.append(entry)

        # 4. Văn án / Giới thiệu
        summary = ""
        summary_block = None
        if parser.summary_sel:
            summary_block = soup.select_one(parser.summary_sel)
        if not summary_block and is_giatoc:
            summary_block = soup.select_one(".detail-summary-block, .detail-synopsis-content")
        if not summary_block:
            for sel in FALLBACK_SUMMARY:
                summary_block = soup.select_one(sel)
                if summary_block:
                    break

        if summary_block:
            summary_p = summary_block.select_one(".detail-summary")
            if summary_p:
                summary = summary_p.get_text(strip=False).strip()
            else:
                for btn in summary_block.select("button, script, style"):
                    btn.decompose()
                summary = summary_block.get_text(strip=False).strip()

        # 5. Ảnh bìa
        cover_url = ""
        cover_elem = None
        if parser.cover_sel:
            cover_elem = soup.select_one(parser.cover_sel)
        if not cover_elem and is_giatoc:
            cover_elem = soup.select_one(".detail-cover-frame img, .detail-hero-cover img")
        if not cover_elem:
            for sel in FALLBACK_COVER:
                cover_elem = soup.select_one(sel)
                if cover_elem:
                    break

        if cover_elem:
            src = cover_elem.get("content") if cover_elem.name == "meta" else (cover_elem.get("src") or cover_elem.get("data-src") or "")
            if src:
                cover_url = urljoin(story_url, src)

        # 6. Thông tin & Thống kê truyện
        status = "Đang cập nhật"
        facts = {}
        if is_giatoc:
            facts_grid = soup.select_one(".detail-facts-grid")
            if facts_grid:
                for span in facts_grid.select("span"):
                    val_el = span.select_one("strong")
                    lbl_el = span.select_one("small")
                    if val_el and lbl_el:
                        lbl = lbl_el.get_text(strip=True)
                        val = val_el.get_text(strip=True)
                        facts[lbl] = val
                        if "trạng thái" in lbl.lower():
                            status = val

        if status == "Đang cập nhật":
            page_text = soup.get_text().lower()
            if any(k in page_text for k in ["hoàn thành", "trọn bộ", "full"]):
                status = "Hoàn thành"
            elif any(k in page_text for k in ["đang ra", "đang cập nhật", "còn tiếp", "chưa hoàn"]):
                status = "Đang cập nhật"

        # Chuẩn hóa trạng thái
        if "hoàn thành" in status.lower():
            status = "Hoàn thành"
        else:
            status = "Đang cập nhật"

        # Tải và lưu ảnh bìa cục bộ vào thư mục covers/
        cover_path = ""
        slug = self.extract_slug(story_url) or "cover"
        if cover_url:
            try:
                covers_dir = os.path.join(os.getcwd(), "covers")
                os.makedirs(covers_dir, exist_ok=True)
                local_cover_file = os.path.join(covers_dir, f"{slug}.jpg")
                cover_data = self.epub_builder.download_cover_image(cover_url)
                if cover_data:
                    with open(local_cover_file, "wb") as f_img:
                        f_img.write(cover_data)
                    cover_path = local_cover_file
            except Exception as e:
                print(f"   ⚠️ Lỗi lưu ảnh bìa cục bộ: {e}")

        # Lưu nội dung văn án & giới thiệu thành file text vào thư mục info/
        info_path = ""
        if summary or name:
            try:
                info_dir = os.path.join(os.getcwd(), "info")
                os.makedirs(info_dir, exist_ok=True)
                local_info_file = os.path.join(info_dir, f"{slug}_gioi_thieu.txt")
                with open(local_info_file, "w", encoding="utf-8") as f_txt:
                    f_txt.write(f"TÊN TRUYỆN: {name}\n")
                    f_txt.write(f"TÁC GIẢ: {author}\n")
                    f_txt.write(f"TRẠNG THÁI: {status}\n")
                    if contributors:
                        f_txt.write(f"ĐỘI NGŨ THỰC HIỆN: {', '.join(contributors)}\n")
                    if facts:
                        f_txt.write("THỐNG KÊ:\n")
                        for k, v in facts.items():
                            f_txt.write(f"  - {k}: {v}\n")
                    f_txt.write(f"LINK TRUYỆN: {story_url}\n")
                    f_txt.write(f"ẢNH BÌA: {cover_url}\n")
                    f_txt.write("\n" + "=" * 60 + "\n")
                    f_txt.write("VĂN ÁN & NỘI DUNG GIỚI THIỆU:\n")
                    f_txt.write("=" * 60 + "\n\n")
                    f_txt.write(summary + "\n")
                info_path = local_info_file
            except Exception as e:
                print(f"   ⚠️ Lỗi lưu file giới thiệu: {e}")

        info = {
            "name": name,
            "author": author,
            "status": status,
            "facts": facts,
            "contributors": contributors,
            "summary": summary,
            "cover_url": cover_url,
            "cover_path": cover_path,
            "info_path": info_path
        }

        print(f"   📖 Tên truyện: {name}")
        print(f"   ✍️  Tác giả: {author}")
        print(f"   📊 Trạng thái: {status}")
        if "Chương" in facts:
            print(f"   📑 Thống kê số chương: {facts['Chương']}")
        if "Cập nhật gần nhất" in facts:
            print(f"   🕒 Cập nhật gần nhất: {facts['Cập nhật gần nhất']}")
        if contributors:
            print(f"   👥 Đội ngũ: {', '.join(contributors)}")
        if cover_path:
            print(f"   🖼️  Ảnh bìa: covers/{slug}.jpg (Đã lưu ảnh làm bìa)")
        elif cover_url:
            print(f"   🖼️  Ảnh bìa: {cover_url[:65]}...")
        if info_path:
            print(f"   📝 Văn án & Giới thiệu: {len(summary)} ký tự -> Đã lưu: info/{slug}_gioi_thieu.txt")
        elif summary:
            print(f"   📝 Văn án: {len(summary)} ký tự")

        return info

    @staticmethod
    def _build_page_url(base_url: str, pattern: str, page_num: int) -> str:
        """Tạo URL trang mục lục tiếp theo dựa trên mẫu pagination_pattern hoặc quy tắc chuẩn."""
        pattern = (pattern or "").strip()
        if not pattern:
            if "?" in base_url:
                return f"{base_url}&page={page_num}"
            else:
                return f"{base_url.rstrip('/')}/trang-{page_num}/"

        if "{url}" in pattern:
            return pattern.replace("{url}", base_url.rstrip("/")).replace("{page}", str(page_num))
        elif "{page}" in pattern:
            if pattern.startswith("http://") or pattern.startswith("https://"):
                return pattern.replace("{page}", str(page_num))
            elif pattern.startswith("?") or pattern.startswith("&"):
                if "?" in base_url and pattern.startswith("?"):
                    pat = "&" + pattern[1:]
                else:
                    pat = pattern
                return base_url.rstrip("/") + pat.replace("{page}", str(page_num))
            else:
                return f"{base_url.rstrip('/')}/{pattern.lstrip('/').replace('{page}', str(page_num))}"
        else:
            if "?" in pattern or "&" in pattern or "=" in pattern:
                joiner = "&" if "?" in base_url else "?"
                return f"{base_url.rstrip('/')}{joiner}{pattern.lstrip('?&')}{page_num}"
            else:
                return f"{base_url.rstrip('/')}/{pattern.lstrip('/')}{page_num}/"

    def _find_active_chapter_sel(self, candidate_selectors: List[str]) -> Optional[str]:
        """Tìm selector phù hợp nhất có phần tử trên trang hiện tại."""
        for sel in candidate_selectors:
            try:
                elems = self.driver.find_elements(By.CSS_SELECTOR, sel)
                if elems:
                    return sel
            except Exception:
                continue
        return None

    def _extract_chapters_from_elements(self, elements, base_url: str, all_chapters: List[Dict[str, Any]]) -> int:
        """Trích xuất và chuẩn hóa danh sách chương từ các phần tử DOM đã tìm thấy."""
        added = 0
        known_urls = {c['url'] for c in all_chapters}
        known_nums = {c['num'] for c in all_chapters}

        for item in elements:
            try:
                href = item.get_attribute("href")
                if not href:
                    try:
                        a_tag = item.find_element(By.TAG_NAME, "a")
                        href = a_tag.get_attribute("href")
                    except Exception:
                        continue
                if not href:
                    continue
                href = urljoin(base_url, href)
                if href in known_urls:
                    continue

                main_title = ""
                try:
                    strong_el = item.find_element(By.CSS_SELECTOR, "strong")
                    main_title = strong_el.text.strip()
                except Exception:
                    pass
                if not main_title:
                    main_title = item.text.strip() or item.get_attribute("title") or ""

                subtitle = ""
                try:
                    p_elems = item.find_elements(By.CSS_SELECTOR, "p")
                    if p_elems:
                        subtitle = p_elems[0].text.strip()
                except Exception:
                    pass

                full_title = f"{main_title}: {subtitle}" if subtitle and subtitle not in main_title else main_title

                # Làm sạch đuôi số thống kê (lượt đọc, like, cmt, view, timestamp)
                full_title = re.sub(r'\.\s*\d{2,15}$', '.', full_title)
                full_title = re.sub(r'\s*[-–—|•·/]?\s*\b\d{3,15}\b\s*$', '', full_title)
                full_title = re.sub(r'\s*[-–—|•·/]?\s*\d+\s*(?:lượt đọc|views?|đọc|likes?|thích|bình luận|comments?|cmt|words?|từ)\s*$', '', full_title, flags=re.IGNORECASE)
                full_title = re.sub(r'^(Chương|Chapter|Chap|Hồi|Tiết)\s*(\d+(?:\.\d+)?)\s*([A-ZÀ-Ỹa-zà-ỹ].*)$', r'\1 \2: \3', full_title, flags=re.IGNORECASE)
                full_title = re.sub(r'\s+', ' ', full_title).strip()

                # Trích xuất số chương (hỗ trợ Chương 0, số thập phân 1.5, hoặc số La Mã/tự tăng)
                chap_num = None
                m = re.search(r'(?:chương|chapter|chap|tiết)\s*(\d+(?:\.\d+)?)', full_title, re.IGNORECASE)
                if m:
                    val = float(m.group(1))
                    chap_num = int(val) if val.is_integer() else val
                else:
                    num_m = re.search(r'\d+', full_title)
                    if num_m:
                        chap_num = int(num_m.group(0))
                    else:
                        chap_num = len(all_chapters)

                # Nếu số chương bị trùng (do web chia phần, thượng/hạ, ngoại truyện), gán chỉ mục tăng dần
                if chap_num in known_nums:
                    max_n = max([c['num'] for c in all_chapters if isinstance(c['num'], (int, float))] or [0])
                    chap_num = max_n + 1

                all_chapters.append({'num': chap_num, 'title': full_title or f"Chương {chap_num}", 'url': href})
                known_urls.add(href)
                known_nums.add(chap_num)
                added += 1
            except Exception:
                continue

        return added

    def get_all_chapters(self, story_url: str) -> List[Dict[str, Any]]:
        """Lấy toàn bộ danh sách chương (hỗ trợ đa trang mục lục: tự động quét hoặc tùy biến thủ công)."""
        if InkittSpecialParser.can_handle(story_url):
            print("   📑 Nhận diện mục lục Inkitt: Đang tải danh sách chương...")
            info = InkittSpecialParser.fetch_story_info(story_url, driver=self.driver)
            return info.get("chapters", [])

        if WattpadSpecialParser.can_handle(story_url):
            print("   📑 Nhận diện mục lục Wattpad: Đang tải danh sách chương...")
            info = WattpadSpecialParser.fetch_story_info(story_url, driver=self.driver)
            return info.get("chapters", [])

        self.browser_manager.ensure_driver_alive()
        self.driver.get(story_url)
        self.human.delay(2.0, 4.0)
        self.human.scroll(self.driver, duration=random.uniform(2.0, 4.0), read_mode=False)

        # Tự động click tab Danh sách chương / Mục lục nếu có
        try:
            self.driver.execute_script("""
                try {
                    const clickables = document.querySelectorAll('button, a, [role="tab"], .tab, .nav-item, li, span');
                    for (const el of clickables) {
                        const txt = (el.textContent || '').trim().toLowerCase();
                        if (txt === 'danh sách chương' || txt === 'mục lục' || txt === 'chương' || txt === 'chapters' || txt === 'table of contents' || txt === 'all chapters') {
                            el.click();
                            break;
                        }
                    }
                } catch (e) {}
            """)
        except Exception:
            pass

        domain = self.parser_manager.get_domain(story_url)
        is_giatoc = ("giatocvuongtai.com" in domain) or ("giatocvuongtai.com" in story_url.lower())
        parser = self.active_custom_parser or self.parser_manager.get_parser(story_url)
        all_chapters: List[Dict[str, Any]] = []
        page = 1
        visited_urls = {story_url, self.driver.current_url}
        max_pages = parser.max_pagination_pages if (parser.max_pagination_pages and parser.max_pagination_pages > 0) else 500

        # Xác định selector danh sách chương
        candidate_selectors = []
        if parser.chapter_list_sel:
            candidate_selectors.append(parser.chapter_list_sel)
        if is_giatoc:
            candidate_selectors.append(".chapter-list-item--link")
        candidate_selectors.extend(FALLBACK_CHAPTER_LIST)

        p_type = (parser.pagination_type or "auto").strip().lower()
        print(f"   📑 Bắt đầu lấy mục lục truyện. Cơ chế phân trang: [{p_type}], Giới hạn: {max_pages} trang.")

        # =========================================================================
        # CHIẾN LƯỢC 1: DÙNG MẪU URL (URL PATTERN, vd: ?page={page} hoặc trang-{page}/)
        # =========================================================================
        if p_type == "url_pattern" and parser.pagination_pattern:
            consecutive_zero = 0
            while page <= max_pages:
                print(f"   Đang lấy danh sách chương trang {page} (theo mẫu URL)...")
                active_ch_sel = self._find_active_chapter_sel(candidate_selectors)
                if active_ch_sel:
                    self.human.scroll(self.driver, duration=random.uniform(1.0, 2.0), read_mode=False)
                    items = self.driver.find_elements(By.CSS_SELECTOR, active_ch_sel)
                    added = self._extract_chapters_from_elements(items, story_url, all_chapters)
                    print(f"      + Trang {page}: Tìm thấy {added} chương mới (Tổng: {len(all_chapters)})")
                    if added == 0:
                        consecutive_zero += 1
                        if consecutive_zero >= 2:
                            break
                    else:
                        consecutive_zero = 0
                else:
                    consecutive_zero += 1
                    if consecutive_zero >= 2:
                        break

                page += 1
                if page > max_pages:
                    break

                next_url = self._build_page_url(story_url, parser.pagination_pattern, page)
                if next_url in visited_urls:
                    break
                visited_urls.add(next_url)
                print(f"   ➡️ Chuyển đến trang {page}: {next_url}")
                self.driver.get(next_url)
                self.human.delay(2.0, 3.5)

        # =========================================================================
        # CHIẾN LƯỢC 2: BẤM NÚT TẢI THÊM (LOAD MORE TRÊN CÙNG 1 TRANG)
        # =========================================================================
        elif p_type == "load_more":
            active_ch_sel = self._find_active_chapter_sel(candidate_selectors)
            load_attempts = 0
            consecutive_zero = 0

            load_more_selectors = []
            if parser.next_page_sel:
                load_more_selectors.append(parser.next_page_sel)
            load_more_selectors.extend([
                "//button[contains(text(), 'Xem thêm') or contains(text(), 'Tải thêm') or contains(text(), 'Xem thêm chương') or contains(translate(text(), 'LOAD MORE', 'load more'), 'load more')]",
                "//a[contains(text(), 'Xem thêm') or contains(text(), 'Tải thêm') or contains(translate(text(), 'LOAD MORE', 'load more'), 'load more')]",
                ".btn-loadmore",
                ".btn-load-more",
                ".load-more-chapter",
                "#btn-loadmore"
            ])

            while load_attempts < max_pages:
                load_attempts += 1
                active_ch_sel = self._find_active_chapter_sel(candidate_selectors) or active_ch_sel
                if active_ch_sel:
                    items = self.driver.find_elements(By.CSS_SELECTOR, active_ch_sel)
                    added = self._extract_chapters_from_elements(items, story_url, all_chapters)
                    print(f"   📑 Lượt quét {load_attempts}: {added} chương mới (Tổng: {len(all_chapters)})")
                    if added == 0 and load_attempts > 1:
                        consecutive_zero += 1
                        if consecutive_zero >= 2:
                            break
                    else:
                        consecutive_zero = 0

                # Tìm nút Load more
                load_btn = None
                for sel in load_more_selectors:
                    try:
                        if sel.startswith("//"):
                            btns = self.driver.find_elements(By.XPATH, sel)
                        else:
                            btns = self.driver.find_elements(By.CSS_SELECTOR, sel)
                        for b in btns:
                            if b.is_displayed():
                                dis = b.get_attribute("disabled") or "disabled" in (b.get_attribute("class") or "")
                                if not dis and b.get_attribute("aria-disabled") != "true":
                                    load_btn = b
                                    break
                        if load_btn:
                            break
                    except Exception:
                        continue

                if not load_btn:
                    print("   ℹ️ Không còn nút 'Xem thêm', đã tải hết danh sách chương.")
                    break

                try:
                    self.driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", load_btn)
                    self.human.delay(0.5, 1.0)
                    self.driver.execute_script("arguments[0].click();", load_btn)
                    self.human.delay(2.0, 4.0)
                except Exception as e:
                    print(f"   ⚠️ Lỗi click nút Xem thêm: {e}")
                    break

        # =========================================================================
        # CHIẾN LƯỢC 3 & 4: NÚT SANG TRANG (NEXT BUTTON) HOẶC TỰ ĐỘNG QUÉT (AUTO DETECT)
        # =========================================================================
        else:
            while page <= max_pages:
                print(f"   Đang lấy danh sách chương trang {page}...")
                active_ch_sel = self._find_active_chapter_sel(candidate_selectors)
                if not active_ch_sel:
                    if page == 1:
                        try:
                            WebDriverWait(self.driver, 5).until(
                                EC.presence_of_element_located((By.CSS_SELECTOR, ".chapter-list-item--link, .list-chapter a, a[href*='chuong']"))
                            )
                            active_ch_sel = self._find_active_chapter_sel(candidate_selectors)
                        except Exception:
                            pass
                    if not active_ch_sel:
                        break

                self.human.scroll(self.driver, duration=random.uniform(1.2, 2.5), read_mode=False)
                items = self.driver.find_elements(By.CSS_SELECTOR, active_ch_sel)
                added_this_page = self._extract_chapters_from_elements(items, story_url, all_chapters)
                print(f"      + Trang {page}: Tìm thấy {added_this_page} chương mới (Tổng: {len(all_chapters)})")

                if added_this_page == 0 and page > 1:
                    break

                if page >= max_pages:
                    print(f"   ℹ️ Đã đạt giới hạn số trang tối đa ({max_pages}).")
                    break

                # Tìm phần tử chuyển sang trang kế tiếp
                next_action_taken = False

                # 1. Thử selector do người dùng tự setup hoặc các nút Sau / Tiếp / rel='next'
                next_candidates = []
                if parser.next_page_sel:
                    next_candidates.append(parser.next_page_sel)
                if p_type in ["auto", "next_button"]:
                    next_candidates.append("//button[contains(translate(text(), 'SAU', 'sau'), 'sau')]")
                    next_candidates.append("//button[contains(text(), 'Sau')]")
                    next_candidates.extend(FALLBACK_NEXT_PAGE)
                    # Sibling của trang active: vd li.active + li a
                    next_candidates.extend([
                        "//li[contains(@class, 'active') or contains(@class, 'current')]/following-sibling::li[1]/a",
                        "//a[contains(@class, 'active') or contains(@class, 'current')]/following-sibling::a[1]",
                        f"//div[contains(@class, 'pagination') or contains(@class, 'pager') or contains(@class, 'page')]//a[normalize-space(text())='{page+1}']",
                        f"//div[contains(@class, 'pagination') or contains(@class, 'pager') or contains(@class, 'page')]//button[normalize-space(text())='{page+1}']",
                        f"//a[normalize-space(text())='{page+1}']",
                        f"//button[normalize-space(text())='{page+1}']"
                    ])

                for n_sel in next_candidates:
                    try:
                        if n_sel.startswith("//"):
                            next_btns = self.driver.find_elements(By.XPATH, n_sel)
                        else:
                            next_btns = self.driver.find_elements(By.CSS_SELECTOR, n_sel)

                        for btn in next_btns:
                            if not btn.is_displayed():
                                continue
                            dis = btn.get_attribute("disabled") or "disabled" in (btn.get_attribute("class") or "")
                            if dis or btn.get_attribute("aria-disabled") == "true":
                                continue

                            # Kiểm tra nếu là thẻ a có href thật
                            href = btn.get_attribute("href")
                            if href and not href.startswith("#") and not href.startswith("javascript:"):
                                full_next = urljoin(self.driver.current_url, href)
                                if full_next != self.driver.current_url and full_next not in visited_urls:
                                    print(f"   ➡️ Chuyển đến trang {page+1} (Direct URL): {full_next}")
                                    visited_urls.add(full_next)
                                    self.driver.get(full_next)
                                    self.human.delay(2.0, 4.0)
                                    page += 1
                                    next_action_taken = True
                                    break

                            # Nếu là button hoặc link onclick JavaScript
                            self.driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", btn)
                            self.human.delay(0.5, 1.0)
                            self.driver.execute_script("arguments[0].click();", btn)
                            self.human.delay(2.0, 4.0)
                            page += 1
                            next_action_taken = True
                            break

                        if next_action_taken:
                            break
                    except Exception:
                        continue

                # 2. Nếu ở chế độ 'auto' và không tìm thấy nút next, kiểm tra URL pattern tự động
                if not next_action_taken and p_type == "auto" and page == 1:
                    try:
                        detected_pattern = ""
                        for link in self.driver.find_elements(By.TAG_NAME, "a"):
                            lh = link.get_attribute("href") or ""
                            if "trang-2" in lh:
                                detected_pattern = "trang-{page}/"
                                break
                            elif "page=2" in lh:
                                detected_pattern = "?page={page}"
                                break

                        if detected_pattern:
                            next_url = self._build_page_url(story_url, detected_pattern, 2)
                            if next_url not in visited_urls:
                                print(f"   🔍 Tự động phát hiện mẫu URL phân trang: {detected_pattern}")
                                print(f"   ➡️ Chuyển đến trang 2: {next_url}")
                                visited_urls.add(next_url)
                                self.driver.get(next_url)
                                self.human.delay(2.0, 4.0)
                                page = 2
                                parser.pagination_pattern = detected_pattern
                                parser.pagination_type = "url_pattern"
                                next_action_taken = True
                    except Exception:
                        pass

                if not next_action_taken:
                    break

        all_chapters.sort(key=lambda x: x['num'])
        print(f"   🎉 Đã tải hoàn tất danh sách: {len(all_chapters)} chương!")
        return all_chapters

    def get_chapter_content(self, url: str, chap_num: int, fast_mode: bool = False) -> Tuple[str, str]:
        """Lấy tiêu đề và nội dung của một chương cụ thể (hỗ trợ chế độ chống bot hoặc siêu tốc WebToEpub)."""
        if InkittSpecialParser.can_handle(url):
            return InkittSpecialParser.fetch_chapter_content(url, chap_num, driver=self.driver)

        if WattpadSpecialParser.can_handle(url):
            return WattpadSpecialParser.fetch_chapter_content(url, chap_num, driver=self.driver)

        max_retry = 3
        parser = self.active_custom_parser or self.parser_manager.get_parser(url)
        is_giatoc = ("giatocvuongtai.com" in url.lower()) or (parser.domain == "giatocvuongtai.com")

        # Thử lấy nhanh trực tiếp bằng HTTP requests nếu ở chế độ fast_mode và không phải Gia Tộc Vượng Tài
        if fast_mode and not is_giatoc:
            try:
                resp = self.http_session.get(url, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Referer": parser.domain or url
                }, timeout=10)
                if resp.status_code == 200:
                    text_lower = resp.text.lower()
                    if not any(k in text_lower for k in ["cf-browser-verification", "checking your browser", "cloudflare-static", "just a moment..."]):
                        soup_fast = BeautifulSoup(resp.text, 'html.parser')
                        c_div = None
                        if parser.chapter_content_sel:
                            c_div = soup_fast.select_one(parser.chapter_content_sel)
                        if not c_div:
                            for sel in FALLBACK_CHAPTER_CONTENT:
                                c_div = soup_fast.select_one(sel)
                                if c_div:
                                    break
                        if c_div:
                            t_title = f"Chương {chap_num}"
                            if parser.chapter_title_sel:
                                t_el = soup_fast.select_one(parser.chapter_title_sel)
                                if t_el:
                                    t_title = t_el.get_text(strip=True)
                            if not t_title:
                                for sel in FALLBACK_CHAPTER_TITLE:
                                    t_el = soup_fast.select_one(sel)
                                    if t_el:
                                        t_title = t_el.get_text(strip=True)
                                        break
                            from .format_processor import ContentFormatCleaner
                            custom_cls = parser.custom_classes_to_remove or getattr(self, 'custom_classes_to_remove', None)
                            clean_html, _ = ContentFormatCleaner.clean_html_content(str(c_div), remove_spam=True, custom_classes=custom_cls)
                            if not clean_html or not clean_html.strip():
                                clean_html = "<p>pass</p>"
                            return t_title or f"Chương {chap_num}", clean_html
            except Exception:
                pass

        for attempt in range(max_retry):
            try:
                # Đảm bảo trình duyệt luôn mở trước khi tải trang
                self.browser_manager.ensure_driver_alive()

                self.driver.get(url)
                if not fast_mode:
                    self.human.delay(2.0, 5.0)

                # Kiểm tra nếu phiên đăng nhập bị hết hạn (chỉ áp dụng cho Gia Tộc Vượng Tài)
                if is_giatoc:
                    page_src = self.driver.page_source or ""
                    page_src_lower = page_src.lower()
                    is_expired = (
                        "phiên đăng nhập không hợp lệ hoặc đã hết hạn" in page_src_lower or
                        "không thể tải lịch hẹn" in page_src_lower or
                        ("đăng nhập lại" in page_src_lower and "không thể" in page_src_lower) or
                        not self.browser_manager.is_logged_in()
                    )
                    if is_expired:
                        print(f"      ⚠️ Phát hiện phiên đăng nhập hết hạn tại chương {chap_num}! Đang tự động đăng nhập lại...")
                        self.browser_manager.clear_session()
                        relog_ok = False
                        if is_giatoc:
                            relog_ok = self.browser_manager.auto_login()
                        elif getattr(parser, 'auto_login', False) and getattr(parser, 'login_email', None):
                            relog_ok = self.browser_manager.auto_login(
                                email=parser.login_email,
                                password=parser.login_password,
                                login_url=parser.login_url,
                                domain=parser.domain
                            )
                        if relog_ok:
                            print(f"      ✅ Đã đăng nhập lại thành công! Tải lại chương {chap_num}...")
                            self.driver.get(url)
                            if not fast_mode:
                                self.human.delay(2.0, 4.0)

                # Chế độ chống bot (human): cuộn chuột mô phỏng hành vi đọc thật
                if not fast_mode:
                    self.human.scroll(self.driver, duration=random.uniform(4.0, 10.0), read_mode=True)
                    if random.random() < 0.3:
                        self.driver.execute_script("window.scrollTo({top: 0, behavior: 'smooth'});")
                        self.human.sleep(random.uniform(1.0, 2.5))

                # Chờ thẻ nội dung xuất hiện (tối đa 6s trong chế độ nhanh, 10s trong chế độ chống bot)
                wait_sec = 6 if fast_mode else 10
                wait_selectors = [parser.chapter_content_sel] if parser.chapter_content_sel else []
                if is_giatoc:
                    wait_selectors.append(".reader-demo-body")
                wait_selectors.extend(["#chapter-content", ".chapter-content", ".reading-content", "article", ".entry-content", ".chapter-c", "#content"])
                try:
                    WebDriverWait(self.driver, wait_sec).until(
                        EC.presence_of_element_located((
                            By.CSS_SELECTOR,
                            ", ".join([s for s in wait_selectors if s])
                        ))
                    )
                except Exception:
                    pass

                soup = BeautifulSoup(self.driver.page_source, 'html.parser')

                # Trích xuất tiêu đề chương
                chap_title = ""
                if parser.chapter_title_sel:
                    t_el = soup.select_one(parser.chapter_title_sel)
                    if t_el:
                        chap_title = t_el.get_text(strip=True)

                if not chap_title and is_giatoc:
                    title_elem = soup.select_one("h2.reader-demo-chapter-heading")
                    if title_elem:
                        raw_title = title_elem.text.strip()
                        m = re.match(r'^(Chương\s*\d+)([^\s\d].*)', raw_title)
                        chap_title = f"{m.group(1)}: {m.group(2)}" if m else raw_title

                if not chap_title:
                    for sel in FALLBACK_CHAPTER_TITLE:
                        title_elem = soup.select_one(sel)
                        if title_elem:
                            raw_title = title_elem.text.strip()
                            m = re.match(r'^(Chương\s*\d+)([^\s\d].*)', raw_title)
                            if m:
                                chap_title = f"{m.group(1)}: {m.group(2)}"
                            else:
                                chap_title = raw_title
                            break

                if not chap_title:
                    chap_title = f"Chương {chap_num}"

                # Trích xuất nội dung chương
                content_div = None
                if parser.chapter_content_sel:
                    content_div = soup.select_one(parser.chapter_content_sel)

                if not content_div and is_giatoc:
                    content_div = soup.select_one("div.reader-demo-body")

                if not content_div:
                    for sel in FALLBACK_CHAPTER_CONTENT:
                        content_div = soup.select_one(sel)
                        if content_div:
                            break

                # Nếu chương không có thẻ chứa nội dung -> Bổ sung chữ pass theo yêu cầu
                if not content_div:
                    print(f"      ℹ️ Chương {chap_num} không tìm thấy nội dung -> Tự động bổ sung chữ 'pass'.")
                    return chap_title, "<p>pass</p>"

                # Làm sạch và chuẩn hóa chuyên sâu (hỗ trợ xóa theo class thủ công hoặc tự động)
                from .format_processor import ContentFormatCleaner
                custom_cls = parser.custom_classes_to_remove or getattr(self, 'custom_classes_to_remove', None)
                clean_html, stats = ContentFormatCleaner.clean_html_content(
                    str(content_div),
                    remove_spam=True,
                    custom_classes=custom_cls
                )

                if stats.get("hidden_tags_removed", 0) > 0:
                    info_type = f"class '{custom_cls}'" if custom_cls else "thẻ ẩn tự động"
                    print(f"      🧹 [Cleaner] Đã loại bỏ {stats['hidden_tags_removed']} {info_type} trong chương {chap_num}")
                if stats.get("spam_tags_removed", 0) > 0:
                    print(f"      🧹 [Cleaner] Đã loại bỏ {stats['spam_tags_removed']} đoạn spam/watermark trong chương {chap_num}")

                # Nếu sau khi lọc không còn thẻ p nào -> Bổ sung chữ pass
                if not clean_html or stats.get("paragraphs_count", 0) == 0 or stats.get("is_pass_chapter"):
                    print(f"      ℹ️ Chương {chap_num} có nội dung trống (không có thẻ p) -> Tự động bổ sung chữ 'pass'.")
                    clean_html = "<p>pass</p>"

                return chap_title, clean_html

            except Exception as e:
                err_str = str(e).lower()
                is_connection_loss = any(k in err_str for k in [
                    "invalid session id", "disconnected", "devtools",
                    "chrome not reachable", "session deleted", "no such window"
                ]) or not self.browser_manager.is_driver_alive()

                if is_connection_loss:
                    print(f"      🚨 Phát hiện Chrome bị đóng/mất kết nối: {e}")
                    try:
                        self.browser_manager.restart_driver()
                    except Exception as rest_err:
                        print(f"      ❌ Lỗi khi tự khởi động lại trình duyệt: {rest_err}")

                if attempt < max_retry - 1:
                    wait = random.triangular(3.0, 6.0, 4.0) if is_connection_loss else random.triangular(5.0, 20.0, 10.0)
                    print(f"      ⚠️ Lần {attempt+1} lỗi: {e}. Thử lại sau {wait:.1f}s...")
                    self.human.sleep(wait)
                else:
                    print(f"\n{'!'*60}")
                    print(f"❌ THẤT BẠI CHƯƠNG {chap_num} SAU {max_retry} LẦN: {e}")
                    print(f"{'!'*60}")
                    if fast_mode or not sys.stdin or not hasattr(sys.stdin, "isatty") or not sys.stdin.isatty():
                        raise RuntimeError(f"Không thể cào chương {chap_num} sau {max_retry} lần thử: {e}")
                    self.browser_manager.ensure_driver_alive()
                    if hasattr(self.human, 'pause_controller') and self.human.pause_controller:
                        self.human.pause_controller.stop()
                    try:
                        import msvcrt
                        while msvcrt.kbhit():
                            msvcrt.getwch()
                    except Exception:
                        pass
                    try:
                        input("⌨️ Nhấn Enter để cào lại...")
                    except Exception:
                        time.sleep(2.0)
                    if hasattr(self.human, 'pause_controller') and self.human.pause_controller:
                        self.human.pause_controller.start()
                    return self.get_chapter_content(url, chap_num, fast_mode=fast_mode)

        raise RuntimeError(f"Không thể cào chương {chap_num}")

    def crawl_story(
        self,
        story_url: str,
        slug: str,
        global_mode: str = "1",
        global_custom_chap: int = 5,
        split_size: int = 0,
        session_limit: Optional[int] = None,
        crawl_engine: str = "human",
        fast_delay: float = 0.8,
        concurrency: int = 3,
        range_start: Optional[int] = None,
        range_end: Optional[int] = None,
        reverse_order: bool = False,
        override_title: Optional[str] = None,
        override_author: Optional[str] = None,
        override_summary: Optional[str] = None,
        override_cover: Optional[str] = None,
        auto_resume: bool = True
    ) -> List[str]:
        """
        Cào một truyện có hỗ trợ checkpoint với 2 cơ chế:
        - crawl_engine="human": Giữ nguyên mô phỏng người đọc thật (chống bot nghiêm ngặt).
        - crawl_engine="web2epub": Cào tự động siêu tốc đa luồng không giới hạn thời gian (như plugin WebToEpub).
        """
        is_fast = (crawl_engine == "web2epub")
        print("\n" + "=" * 60)
        print(f"📖 Đang xử lý: {slug}")
        if is_fast:
            print("⚡ [CHẾ ĐỘ CÀO: SIÊU TỐC WEBTOEPUB]")
            print(f"   • Tự động cào không giới hạn thời gian đọc giả lập")
            print(f"   • Số luồng đồng thời: {concurrency} luồng")
            print(f"   • Trích xuất DOM tức thì (~1s/chương)")
            print(f"   • Delay giữa các chương: ~{fast_delay:.1f}s (Random Jitter ±30%)")
        else:
            print("🛡️ [CHẾ ĐỘ CÀO: CHỐNG BOT / GIẢ LẬP NGƯỜI ĐỌC THẬT]")
            print("   • Giữ nguyên cơ chế mô phỏng đọc theo WPM, cuộn trang tự nhiên")
            print("   • Nghỉ định kỳ & nghỉ dài chống quét bot/khóa tài khoản")
        print("=" * 60)

        # Đảm bảo trình duyệt đã mở và tài khoản đã đăng nhập
        parser = self.active_custom_parser or self.parser_manager.get_parser(story_url)
        is_giatoc = ("giatocvuongtai.com" in story_url.lower()) or (parser.domain == "giatocvuongtai.com")
        if is_giatoc:
            self.browser_manager.ensure_logged_in(interactive=False)
        elif getattr(parser, 'auto_login', False) and getattr(parser, 'login_email', None):
            self.browser_manager.ensure_logged_in_for_site(parser, interactive=False)
        else:
            self.browser_manager.ensure_driver_alive()
        self.stop_requested = False
        if hasattr(self.human, 'pause_controller') and self.human.pause_controller:
            self.human.pause_controller.stop_requested = False

        checkpoint = self.checkpoint_manager.load(slug)
        resume_from = 0
        chap_data = []
        name = author = None
        all_chapters = None
        story_info = {}

        if checkpoint:
            print(f"\n💾 Tìm thấy checkpoint cũ!")
            print(f"   Truyện: {checkpoint['name']}")
            print(f"   Trạng thái cũ: {checkpoint.get('status', 'Đang cập nhật')}")
            print(f"   Đã crawl: {len(checkpoint['chapters'])} chương")
            print(f"   Lưu lúc: {checkpoint['saved_at']}")

            done = len(checkpoint['chapters'])
            total_known = len(checkpoint.get('all_chapters', []))
            print(f"   📊 Tiến độ: {done}/{total_known} chương")

            if auto_resume:
                resume_choice = 'y'
            else:
                try:
                    resume_choice = input("   ➡️  Tiếp tục từ checkpoint? (y/n) [y]: ").strip().lower()
                except Exception:
                    resume_choice = 'y'

            if resume_choice != 'n':
                name = checkpoint['name']
                author = checkpoint['author']
                chap_data = checkpoint['chapters']
                resume_from = len(chap_data)
                story_info = checkpoint.get('story_info', {})

                # Cập nhật thông tin và danh sách chương mới nhất từ website
                print("\n🔄 Đang kiểm tra trạng thái và chương mới nhất từ website...")
                fresh_info = self.get_story_info(story_url)
                if fresh_info:
                    story_info = fresh_info
                    name = story_info['name']
                    author = story_info['author']

                fresh_chapters = self.get_all_chapters(story_url)
                if fresh_chapters:
                    all_chapters = fresh_chapters
                else:
                    all_chapters = checkpoint.get('all_chapters', [])

                total = len(all_chapters)
                status = story_info.get("status", "Đang cập nhật")
                print(f"   📊 Trạng thái hiện tại: {status}")
                print(f"   📑 Tổng số chương trên web: {total} (Đã cào trước đó: {done})")
                if total > done:
                    print(f"   ✨ Có {total - done} chương mới cần cào!")
                else:
                    print(f"   ℹ️ Chưa có chương mới trên web.")
                print(f"   ✅ Sẽ tiếp tục từ chương index {resume_from + 1}")
            else:
                self.checkpoint_manager.delete(slug)
                print("   🗑️  Đã xóa checkpoint cũ.")

        # Lấy thông tin truyện nếu chưa có
        if not story_info or not name:
            print("\n📖 Đang lấy thông tin truyện...")
            story_info = self.get_story_info(story_url)
            name = story_info['name']
            author = story_info['author']

        # Áp dụng Metadata Override nếu người dùng tùy chỉnh
        if override_title and override_title.strip():
            name = override_title.strip()
            story_info['name'] = name
            print(f"   ✏️ [Metadata Override] Tên truyện: {name}")
        if override_author and override_author.strip():
            author = override_author.strip()
            story_info['author'] = author
            print(f"   ✏️ [Metadata Override] Tác giả: {author}")
        if override_summary and override_summary.strip():
            story_info['summary'] = override_summary.strip()
            print("   ✏️ [Metadata Override] Văn án / Tóm tắt")
        if override_cover and override_cover.strip():
            story_info['cover_url'] = override_cover.strip()
            print(f"   ✏️ [Metadata Override] Ảnh bìa: {override_cover.strip()}")

        status = story_info.get("status", "Đang cập nhật")

        # Lấy danh sách chương nếu chưa có
        if not all_chapters:
            print("\n📑 Đang lấy danh sách chương...")
            all_chapters = self.get_all_chapters(story_url)

        if not all_chapters:
            print("❌ Không tìm thấy chương nào!")
            return []

        total = len(all_chapters)
        print(f"\n✅ Tổng cộng {total} chương trên web (Trạng thái: {status})")

        # Sắp xếp lại chap_data và tìm các chương chưa cào
        chap_data.sort(key=lambda x: x['num'])
        crawled_nums = {c['num'] for c in chap_data}
        missing_chapters = [c for c in all_chapters if c['num'] not in crawled_nums]

        total_done = len(chap_data)
        total_missing = len(missing_chapters)

        # Xác định số lượng chương cần cào theo chế độ
        if global_mode == "range" or (range_start is not None and range_end is not None):
            s_val = max(1, range_start if range_start is not None else 1)
            e_val = range_end if range_end is not None else len(all_chapters)
            if s_val > e_val:
                s_val, e_val = e_val, s_val
            target_list = [c for c in all_chapters if s_val <= c['num'] <= e_val]
            target_list = [c for c in target_list if c['num'] not in crawled_nums]
            print(f"   🎯 [Chế độ khoảng chương]: Từ chương {s_val} đến chương {e_val} (Cần cào {len(target_list)} chương)")
        elif global_mode == "1":
            target_list = missing_chapters
        elif global_mode == "2":
            target_list = missing_chapters[:5]
        elif global_mode == "3":
            target_list = missing_chapters[:global_custom_chap]
        else:
            target_list = missing_chapters

        if reverse_order:
            print("   🔄 [Đảo ngược]: Đã đảo ngược thứ tự danh sách chương.")
            target_list.reverse()

        # Giới hạn phiên cào
        if session_limit is not None and session_limit > 0:
            chapters_to_crawl = target_list[:session_limit]
        else:
            chapters_to_crawl = target_list

        print(f"\n📊 Tiến độ hiện tại: đã cào {total_done}/{total} chương")
        if missing_chapters and missing_chapters[0]['num'] == 0:
            print(f"   ✨ Phát hiện Chương 0 (Mở đầu/Thuật ngữ) chưa cào -> Sẽ ưu tiên cào trước!")
        print(f"🎯 Kế hoạch phiên này: cào {len(chapters_to_crawl)} chương (Tổng còn thiếu: {total_missing} chương)")

        if not chapters_to_crawl:
            if status == "Hoàn thành" and total_done >= total:
                print(f"\n✅ Truyện đã [HOÀN THÀNH] và crawl đủ {total}/{total} chương! Tạo file EPUB...")
                if checkpoint or chap_data:
                    files = self.epub_builder.create_split_epub(
                        name=name,
                        author=author,
                        chapters=chap_data,
                        split_size=split_size,
                        story_info=story_info
                    )
                    self.checkpoint_manager.delete(slug)
                    print(f"   🗑️ Đã xóa checkpoint (hoàn tất).")
                    return files
            else:
                print(f"\nℹ️ Truyện [{status.upper()}] hiện chưa có thêm chương mới cần cào ({total_done}/{total} chương).")
                print(f"   💾 Checkpoint được giữ lại để tiếp tục kiểm tra vào lần sau.")
                if checkpoint or chap_data:
                    print(f"📚 Đang cập nhật xuất file EPUB cho các chương hiện có...")
                    files = self.epub_builder.create_split_epub(
                        name=name,
                        author=author,
                        chapters=chap_data,
                        split_size=split_size,
                        story_info=story_info
                    )
                    return files
            return []

        failed = []

        print("\n" + "-" * 60)
        print("💡 MẸO: Bạn có thể nhấn phím [CÁCH] (Spacebar) bất kỳ lúc nào")
        print("   để TẠM DỪNG (Pause) hoặc TIẾP TỤC (Resume) tiến trình cào.")
        print("-" * 60)

        if hasattr(self.human, 'pause_controller') and self.human.pause_controller:
            self.human.pause_controller.start()

        try:
            if is_fast and concurrency > 1:
                import concurrent.futures
                print(f"\n⚡ Kích hoạt cào Siêu Tốc Đa Luồng: {concurrency} luồng đồng thời (Delay: {fast_delay:.1f}s ± 30% Jitter)...")

                try:
                    if self.browser_manager.is_driver_alive():
                        for ck in self.driver.get_cookies():
                            self.http_session.cookies.set(ck['name'], ck['value'], domain=ck.get('domain', ''))
                except Exception:
                    pass

                def _fetch_worker(chap_info):
                    if self.stop_requested or getattr(self.human, 'stop_requested', False):
                        return None
                    c_num = chap_info['num']
                    c_title = chap_info['title']
                    c_url = chap_info['url']
                    if fast_delay > 0:
                        jitter = fast_delay * random.uniform(-0.3, 0.3)
                        time.sleep(max(0.02, fast_delay + jitter))
                    t, cont = self.get_chapter_content(c_url, c_num, fast_mode=True)
                    return {
                        'num': c_num,
                        'title': t or c_title,
                        'content': cont
                    }

                with concurrent.futures.ThreadPoolExecutor(max_workers=min(10, max(1, concurrency))) as executor:
                    future_to_chap = {executor.submit(_fetch_worker, ch): ch for ch in chapters_to_crawl}
                    for f_idx, future in enumerate(concurrent.futures.as_completed(future_to_chap), 1):
                        ch_item = future_to_chap[future]
                        if self.stop_requested or getattr(self.human, 'stop_requested', False):
                            print("\n⏹️ [ĐÃ DỪNG] Đã nhận tín hiệu dừng cào song song.")
                            break
                        try:
                            res = future.result()
                            if res:
                                chap_data = [cd for cd in chap_data if cd['num'] != res['num']]
                                chap_data.append(res)
                                chap_data.sort(key=lambda x: x['num'])
                                plain_text = re.sub(r'<[^>]+>', ' ', res['content'])
                                w_count = len(plain_text.split())
                                print(f"   [{f_idx}/{len(chapters_to_crawl)}] (Tổng: {len(chap_data)}/{total}) Chương {res['num']}: {res['title'][:50]} ({len(res['content'])} ký tự, {w_count:,} từ)")
                                self.failed_chapters = [fc for fc in self.failed_chapters if fc['num'] != res['num']]
                        except Exception as exc:
                            print(f"      ❌ Lỗi chương {ch_item['num']}: {exc}")
                            failed.append(ch_item['num'])
                            self.failed_chapters.append({
                                'num': ch_item['num'],
                                'title': ch_item['title'],
                                'url': ch_item['url'],
                                'error': str(exc)
                            })
                            chap_data = [cd for cd in chap_data if cd['num'] != ch_item['num']]
                            chap_data.append({
                                'num': ch_item['num'],
                                'title': ch_item['title'],
                                'content': "<p>Lỗi khi crawl nội dung</p>"
                            })
                            chap_data.sort(key=lambda x: x['num'])

                        # Lưu checkpoint sau mỗi chương
                        self.checkpoint_manager.save(
                            slug=slug,
                            name=name,
                            author=author,
                            chapters_done=chap_data,
                            all_chapters=all_chapters,
                            last_index=len(chap_data),
                            story_info=story_info,
                            story_url=story_url,
                            status=status
                        )
            else:
                # Vòng lặp cào từng chương tuần tự (Chế độ Chống Bot / Giả lập người đọc thật)
                for idx, chap in enumerate(chapters_to_crawl, 1):
                    # 1. Kiểm tra yêu cầu dừng TRƯỚC mỗi chương
                    if self.stop_requested or getattr(self.human, 'stop_requested', False):
                        print(f"\n⏹️ [ĐÃ DỪNG] Đã nhận tín hiệu dừng từ người dùng. Không cào thêm chương {chap['num']}!")
                        break

                    if hasattr(self.human, 'pause_controller') and self.human.pause_controller:
                        self.human.pause_controller.wait_if_paused()

                    # Kiểm tra lại nếu người dùng bấm dừng trong khi đang tạm dừng
                    if self.stop_requested or getattr(self.human, 'stop_requested', False):
                        print(f"\n⏹️ [ĐÃ DỪNG] Đã nhận tín hiệu dừng từ người dùng. Dừng cào ngay!")
                        break

                    chap_num = chap['num']
                    chap_title = chap['title']
                    print(f"\n   [{idx}/{len(chapters_to_crawl)}] (Tổng: {len(chap_data)+1}/{total}) Chương {chap_num}: {chap_title[:60]}")

                    word_count = 0
                    try:
                        title, content = self.get_chapter_content(chap['url'], chap_num, fast_mode=is_fast)
                        chap_data = [c for c in chap_data if c['num'] != chap_num]
                        chap_data.append({
                            'num': chap_num,
                            'title': title or chap_title,
                            'content': content
                        })
                        chap_data.sort(key=lambda x: x['num'])

                        # Đếm số từ của chương (bỏ qua thẻ HTML)
                        plain_text = re.sub(r'<[^>]+>', ' ', content)
                        word_count = len(plain_text.split())
                        print(f"      ✅ Đã lấy nội dung ({len(content)} ký tự, {word_count:,} từ)")
                        self.failed_chapters = [fc for fc in self.failed_chapters if fc['num'] != chap_num]
                    except Exception as e:
                        print(f"      ❌ Lỗi: {e}")
                        failed.append(chap_num)
                        self.failed_chapters.append({
                            'num': chap_num,
                            'title': chap_title,
                            'url': chap['url'],
                            'error': str(e)
                        })
                        chap_data = [c for c in chap_data if c['num'] != chap_num]
                        chap_data.append({
                            'num': chap_num,
                            'title': chap_title,
                            'content': "<p>Lỗi khi crawl nội dung</p>"
                        })
                        chap_data.sort(key=lambda x: x['num'])
                        word_count = 0

                    # Lưu checkpoint SAU MỖI chương
                    self.checkpoint_manager.save(
                        slug=slug,
                        name=name,
                        author=author,
                        chapters_done=chap_data,
                        all_chapters=all_chapters,
                        last_index=len(chap_data),
                        story_info=story_info,
                        story_url=story_url,
                        status=status
                    )

                    # 2. Kiểm tra yêu cầu dừng SAU KHI lưu checkpoint chương hiện tại
                    if self.stop_requested or getattr(self.human, 'stop_requested', False):
                        print(f"\n⏹️ [ĐÃ DỪNG] Đã lưu an toàn checkpoint chương {chap_num}. Dừng tiến trình ngay!")
                        break

                    # Nghỉ giữa các chương (trừ chương cuối cùng của phiên)
                    if idx < len(chapters_to_crawl):
                        if is_fast:
                            # ⚡ Chế độ WebToEpub: Không giới hạn thời gian đọc, delay nhẹ 0.5s - 1.5s
                            delay_val = random.uniform(max(0.2, fast_delay * 0.7), max(0.4, fast_delay * 1.3))
                            self.human.sleep(delay_val)
                        else:
                            # 🛡️ Chế độ Chống Bot: Giữ nguyên cơ chế giả lập người đọc thật
                            self.human.long_break(idx)
                            if self.stop_requested or getattr(self.human, 'stop_requested', False):
                                break
                            self.human.read_chapter_pause(word_count=word_count)
                            if self.stop_requested or getattr(self.human, 'stop_requested', False):
                                break
                            self.human.chapter_break()
                            if self.stop_requested or getattr(self.human, 'stop_requested', False):
                                break
        finally:
            if hasattr(self.human, 'pause_controller') and self.human.pause_controller:
                self.human.pause_controller.stop()

        # 3. Xử lý trường hợp người dùng chủ động bấm Dừng
        if self.stop_requested or getattr(self.human, 'stop_requested', False):
            crawled_now = len(chap_data)
            remaining = total - crawled_now
            print(f"\n{'='*60}")
            print(f"⏹️  ĐÃ DỪNG TIẾN TRÌNH VÀ LƯU CHECKPOINT AN TOÀN")
            print(f"{'='*60}")
            print(f"   Truyện: {name}")
            print(f"   Trạng thái: {status}")
            print(f"   Đã cào an toàn: {crawled_now}/{total} chương")
            print(f"   Còn lại: {remaining} chương")
            print(f"   💾 Checkpoint đã lưu an toàn: {self.checkpoint_manager.get_path(slug)}")
            print(f"   👉 Đã dừng lại ngay lập tức, hoàn toàn không cào lướt vội bất kỳ chương nào!")
            print(f"{'='*60}\n")
            return []

        if failed:
            print(f"\n⚠️ Các chương lỗi: {failed}")

        # Kiểm tra trạng thái hoàn thành
        crawled_now = len(chap_data)
        is_full_story = (crawled_now >= total)
        is_completed = (status == "Hoàn thành")
        finished_target = len([c for c in target_list if c['num'] in {cd['num'] for cd in chap_data}]) >= len(target_list)

        if is_full_story or finished_target:
            print(f"\n📚 Đã hoàn tất phiên ({crawled_now}/{total} chương). Tạo file EPUB...")
            files = self.epub_builder.create_split_epub(
                name=name,
                author=author,
                chapters=chap_data,
                split_size=split_size,
                story_info=story_info
            )
            if is_completed and is_full_story:
                self.checkpoint_manager.delete(slug)
                print(f"   🗑️ Truyện đã [HOÀN THÀNH] và crawl đủ {total}/{total} chương -> Đã xóa checkpoint!")
            else:
                self.checkpoint_manager.save(
                    slug=slug,
                    name=name,
                    author=author,
                    chapters_done=chap_data,
                    all_chapters=all_chapters,
                    last_index=crawled_now,
                    story_info=story_info,
                    story_url=story_url,
                    status=status
                )
                if not is_completed:
                    print(f"   💾 Truyện ở trạng thái [ĐANG CẬP NHẬT] -> Giữ lại checkpoint để tự động kiểm tra và cào chương mới!")
                else:
                    print(f"   💾 Đã hoàn tất phiên ({crawled_now}/{total} chương) -> Lưu checkpoint để cào tiếp các chương còn lại!")
            print(f"\n✅ XONG PHIÊN CRAWL '{name}'! Tạo {len(files)} file.")
            return files
        else:
            remaining = total - crawled_now
            print(f"\n{'='*60}")
            print(f"⏸️  KẾT THÚC PHIÊN CRAWL (CHƯA ĐẠT CHỈ TIÊU)")
            print(f"{'='*60}")
            print(f"   Truyện: {name}")
            print(f"   Trạng thái: {status}")
            print(f"   Đã crawl: {crawled_now}/{total} chương")
            print(f"   Còn lại: {remaining} chương")
            print(f"   💾 Checkpoint đã lưu an toàn: {self.checkpoint_manager.get_path(slug)}")
            print(f"   👉 Lần sau mở tool sẽ hiện trong danh sách để bạn chọn cào tiếp!")
            print(f"{'='*60}")
            return []

    def check_story_update(self, slug: str) -> Dict[str, Any]:
        """
        Kiểm tra trạng thái và chương mới trên website cho một truyện từ checkpoint mà không cần cào toàn bộ.
        """
        self.browser_manager.ensure_logged_in(interactive=False)

        checkpoint = self.checkpoint_manager.load(slug)
        if not checkpoint:
            return {"success": False, "message": f"Không tìm thấy checkpoint {slug}"}

        story_url = checkpoint.get("story_url") or f"{self.base_url.rstrip('/')}/stories/{slug}/"
        old_status = checkpoint.get("status") or (checkpoint.get("story_info") or {}).get("status", "Đang cập nhật")
        old_done = len(checkpoint.get("chapters", []))
        old_total = len(checkpoint.get("all_chapters", []))

        print(f"\n🔍 Đang kiểm tra cập nhật trên web cho: {checkpoint.get('name', slug)}...")
        new_info = self.get_story_info(story_url)
        new_status = new_info.get("status", old_status)

        new_all_chapters = self.get_all_chapters(story_url)
        new_total = len(new_all_chapters)
        new_chapters_count = max(0, new_total - old_done)

        # Cập nhật checkpoint với thông tin mới nhất
        self.checkpoint_manager.save(
            slug=slug,
            name=new_info.get("name", checkpoint.get("name")),
            author=new_info.get("author", checkpoint.get("author")),
            chapters_done=checkpoint.get("chapters", []),
            all_chapters=new_all_chapters,
            last_index=old_done,
            story_info=new_info,
            story_url=story_url,
            status=new_status
        )

        return {
            "success": True,
            "slug": slug,
            "name": new_info.get("name", checkpoint.get("name")),
            "old_status": old_status,
            "new_status": new_status,
            "old_total": old_total,
            "new_total": new_total,
            "crawled_count": old_done,
            "new_chapters_count": new_chapters_count,
            "has_new_chapters": (new_total > old_total),
            "status_changed": (old_status != new_status)
        }

