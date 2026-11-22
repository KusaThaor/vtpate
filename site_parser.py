"""
Module cấu hình và quản lý bộ bóc tách tùy biến cho mọi trang web truyện (Custom Site Parser).
Cho phép người dùng tự setup CSS selectors cho bất kỳ trang web nào (giống plugin WebToEpub),
kể cả các trang không có mã chuẩn hoặc web mới, hỗ trợ tự động nhận diện và lưu trữ cấu hình.
"""

import os
import re
import json
from urllib.parse import urlparse
from typing import Dict, List, Optional, Any, Tuple
from bs4 import BeautifulSoup


# Danh sách các selector dự phòng thông minh (Heuristics) cho mọi web truyện (Trung lập, không phụ thuộc riêng web nào)
FALLBACK_STORY_TITLE = [
    "h1.story-title",
    "h1.title",
    "h1.novel-title",
    "h1.name",
    ".book-title h1",
    ".story-info h1",
    ".post-title h1",
    ".truyen-title",
    "meta[property='og:title']",
    "h1"
]

FALLBACK_AUTHOR = [
    ".author a",
    ".story-author a",
    "a[href*='/author/']",
    "a[href*='tac-gia']",
    "a[href*='author']",
    ".author",
    ".story-author",
    ".info-holder .author a",
    "meta[name='author']"
]

FALLBACK_COVER = [
    ".book-cover img",
    ".story-thumb img",
    ".thumb img",
    ".book-info img",
    ".media-cover img",
    ".cover img",
    "meta[property='og:image']",
    "img.cover"
]

FALLBACK_SUMMARY = [
    ".desc-text",
    ".story-intro",
    ".summary",
    "#tab-intro",
    ".description",
    ".intro-content",
    ".story-desc",
    ".detail-summary",
    ".content-intro",
    "meta[property='og:description']"
]

FALLBACK_CHAPTER_LIST = [
    ".chapter-list a",
    ".list-chapter a",
    "ul.list-chapters a",
    ".list-chaps a",
    "#list-chapter a",
    ".table-chapters a",
    ".list-truyen a",
    "a[href*='chuong-']",
    "a[href*='chapter-']",
    "a[href*='chap-']",
    "a[href*='/c']"
]

FALLBACK_NEXT_PAGE = [
    # Tiếng Việt nút Sau / Tiếp
    "//button[contains(text(), 'Sau')]",
    "//a[contains(text(), 'Sau')]",
    "//a[contains(text(), 'Tiếp')]",
    "//button[contains(text(), 'Tiếp')]",
    "//a[contains(text(), 'Trang sau')]",
    "//a[contains(text(), 'Trang kế')]",
    "//button[contains(text(), 'Trang sau')]",
    
    # Ký hiệu mũi tên chuyển trang
    "//a[contains(text(), '»') or contains(text(), '›') or contains(text(), '>')]",
    "//button[contains(text(), '»') or contains(text(), '›') or contains(text(), '>')]",
    
    # English & Chuẩn HTML rel=next
    "//button[contains(translate(text(), 'NEXT', 'next'), 'next')]",
    "//a[contains(translate(text(), 'NEXT', 'next'), 'next')]",
    "a[rel='next']",
    "link[rel='next']",
    
    # Class selectors phân trang thông dụng
    ".pagination .next a",
    ".pagination li.next a",
    ".pagination .page-next a",
    ".pagination a.next",
    ".pagination a.next-page",
    ".page-nav .next a",
    ".pager .next a",
    "a.next-page",
    "a.next",
    ".btn-next",
    "#pagination-next",
    
    # Chuyển số trang liền kề (active + 1)
    "//li[contains(@class, 'active')]/following-sibling::li[1]/a",
    "//li[contains(@class, 'current')]/following-sibling::li[1]/a",
    "//a[contains(@class, 'active')]/following-sibling::a[1]",
    "//a[contains(@class, 'current')]/following-sibling::a[1]",
    
    # Nút Xem Thêm / Tải Thêm Chương (Load More)
    "//button[contains(text(), 'Xem thêm') or contains(text(), 'Tải thêm') or contains(text(), 'Xem thêm chương')]",
    "//a[contains(text(), 'Xem thêm') or contains(text(), 'Tải thêm')]",
    ".btn-loadmore",
    ".btn-load-more",
    ".load-more-chapter"
]

FALLBACK_CHAPTER_TITLE = [
    "h2.chapter-title",
    "h1.chapter-title",
    ".chapter-title",
    ".chapter-heading",
    ".entry-title",
    "h2.title",
    "h1.title",
    "h2",
    "h1"
]

FALLBACK_CHAPTER_CONTENT = [
    "#chapter-content",
    ".chapter-content",
    ".reading-content",
    ".entry-content",
    ".chapter-c",
    "#content",
    ".text-content",
    ".content-wrap",
    ".cha-content",
    "article"
]


class SiteParserConfig:
    """Đại diện cấu hình bộ bóc tách cho 1 website cụ thể."""

    def __init__(
        self,
        domain: str = "",
        name: str = "",
        story_title_sel: str = "",
        author_sel: str = "",
        cover_sel: str = "",
        summary_sel: str = "",
        chapter_list_sel: str = "",
        next_page_sel: str = "",
        chapter_title_sel: str = "",
        chapter_content_sel: str = "",
        custom_classes_to_remove: str = "",
        is_spa: bool = False,
        login_url: str = "",
        login_email: str = "",
        login_password: str = "",
        auto_login: bool = False,
        pagination_type: str = "auto",
        pagination_pattern: str = "",
        max_pagination_pages: int = 0
    ):
        self.domain = domain.strip().lower()
        self.name = name.strip() or self.domain or "Tùy biến"
        self.story_title_sel = story_title_sel.strip()
        self.author_sel = author_sel.strip()
        self.cover_sel = cover_sel.strip()
        self.summary_sel = summary_sel.strip()
        self.chapter_list_sel = chapter_list_sel.strip()
        self.next_page_sel = next_page_sel.strip()
        self.chapter_title_sel = chapter_title_sel.strip()
        self.chapter_content_sel = chapter_content_sel.strip()
        self.custom_classes_to_remove = custom_classes_to_remove.strip()
        self.is_spa = is_spa
        self.login_url = login_url.strip()
        self.login_email = login_email.strip()
        self.login_password = login_password.strip()
        self.auto_login = bool(auto_login)
        self.pagination_type = pagination_type.strip() if pagination_type else "auto"
        self.pagination_pattern = pagination_pattern.strip()
        self.max_pagination_pages = int(max_pagination_pages) if max_pagination_pages else 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "domain": self.domain,
            "name": self.name,
            "story_title_sel": self.story_title_sel,
            "author_sel": self.author_sel,
            "cover_sel": self.cover_sel,
            "summary_sel": self.summary_sel,
            "chapter_list_sel": self.chapter_list_sel,
            "next_page_sel": self.next_page_sel,
            "chapter_title_sel": self.chapter_title_sel,
            "chapter_content_sel": self.chapter_content_sel,
            "custom_classes_to_remove": self.custom_classes_to_remove,
            "is_spa": self.is_spa,
            "login_url": self.login_url,
            "login_email": self.login_email,
            "login_password": self.login_password,
            "auto_login": self.auto_login,
            "pagination_type": self.pagination_type,
            "pagination_pattern": self.pagination_pattern,
            "max_pagination_pages": self.max_pagination_pages
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'SiteParserConfig':
        return cls(
            domain=data.get("domain", ""),
            name=data.get("name", ""),
            story_title_sel=data.get("story_title_sel", ""),
            author_sel=data.get("author_sel", ""),
            cover_sel=data.get("cover_sel", ""),
            summary_sel=data.get("summary_sel", ""),
            chapter_list_sel=data.get("chapter_list_sel", ""),
            next_page_sel=data.get("next_page_sel", ""),
            chapter_title_sel=data.get("chapter_title_sel", ""),
            chapter_content_sel=data.get("chapter_content_sel", ""),
            custom_classes_to_remove=data.get("custom_classes_to_remove", ""),
            is_spa=data.get("is_spa", False),
            login_url=data.get("login_url", ""),
            login_email=data.get("login_email", ""),
            login_password=data.get("login_password", ""),
            auto_login=data.get("auto_login", False),
            pagination_type=data.get("pagination_type", "auto"),
            pagination_pattern=data.get("pagination_pattern", ""),
            max_pagination_pages=data.get("max_pagination_pages", 0)
        )


class SiteParserManager:
    """Quản lý các profile trang web tùy biến và lưu trữ tại custom_sites.json."""

    def __init__(self, config_file: Optional[str] = None):
        if not config_file:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            config_file = os.path.join(base_dir, "custom_sites.json")
        self.config_file = config_file
        self.sites: Dict[str, SiteParserConfig] = {}
        self._load_defaults()
        self.load()

    def _load_defaults(self):
        """Cấu hình sẵn cho các trang thông dụng."""
        login_u = "https://giatocvuongtai.com/register"
        login_e = "thanhsacvuduc123@gmail.com"
        login_p = "Thaor0345333661."
        auto_l = True
        try:
            from vtpate.config import AUTH_CONFIG
            login_u = AUTH_CONFIG.get("login_url", login_u)
            login_e = AUTH_CONFIG.get("email", login_e)
            login_p = AUTH_CONFIG.get("password", login_p)
            auto_l = AUTH_CONFIG.get("auto_login", auto_l)
        except Exception:
            pass

        # Gia Tộc Vượng Tài (Mặc định)
        vt_cfg = SiteParserConfig(
            domain="giatocvuongtai.com",
            name="Gia Tộc Vượng Tài",
            story_title_sel="h1.detail-hero-title",
            author_sel=".detail-byline__item strong, .detail-byline__item, a[href*='/tac-gia/']",
            cover_sel=".detail-hero-cover img",
            summary_sel=".detail-synopsis-content",
            chapter_list_sel=".chapter-list-item--link",
            next_page_sel="//button[contains(text(), 'Sau')]",
            chapter_title_sel="h2.reader-demo-chapter-heading",
            chapter_content_sel="div.reader-demo-body",
            is_spa=True,
            login_url=login_u,
            login_email=login_e,
            login_password=login_p,
            auto_login=auto_l
        )
        self.sites["giatocvuongtai.com"] = vt_cfg

    def load(self):
        """Nạp cấu hình tùy biến từ file JSON."""
        if os.path.exists(self.config_file):
            try:
                with open(self.config_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for domain, cfg_data in data.items():
                        self.sites[domain.lower()] = SiteParserConfig.from_dict(cfg_data)
            except Exception as e:
                print(f"⚠️ Lỗi đọc file {self.config_file}: {e}")

    def save(self):
        """Lưu danh sách cấu hình tùy biến ra file JSON."""
        try:
            data = {d: cfg.to_dict() for d, cfg in self.sites.items()}
            with open(self.config_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"❌ Lỗi ghi file cấu hình website: {e}")

    def get_domain(self, url: str) -> str:
        """Trích xuất domain sạch từ URL."""
        if not url:
            return ""
        if not url.startswith("http"):
            url = f"https://{url}"
        parsed = urlparse(url)
        netloc = parsed.netloc.lower()
        # Bỏ port hoặc www.
        if ":" in netloc:
            netloc = netloc.split(":")[0]
        if netloc.startswith("www."):
            netloc = netloc[4:]
        return netloc

    def get_parser(self, url: str) -> SiteParserConfig:
        """Lấy cấu hình bóc tách cho URL. Nếu chưa có cấu hình riêng, trả về Generic Parser thông minh."""
        domain = self.get_domain(url)
        if domain in self.sites:
            return self.sites[domain]

        # Kiểm tra subdomain
        for d, cfg in self.sites.items():
            if domain.endswith(f".{d}") or d.endswith(f".{domain}"):
                return cfg

        # Trả về Generic Parser (dùng danh sách Heuristics)
        return SiteParserConfig(domain=domain, name=f"Tự động ({domain or 'Chung'})")

    def save_parser(self, config: SiteParserConfig):
        """Lưu hoặc cập nhật một cấu hình trang web."""
        if config.domain:
            self.sites[config.domain.lower()] = config
            self.save()

    def delete_parser(self, domain: str) -> bool:
        """Xóa cấu hình của 1 domain."""
        domain_clean = domain.strip().lower()
        if domain_clean in self.sites and domain_clean != "giatocvuongtai.com":
            del self.sites[domain_clean]
            self.save()
            return True
        return False

    def get_auth_for_domain(self, domain: str) -> Dict[str, Any]:
        """Lấy thông tin tài khoản đăng nhập cho một domain."""
        d = self.get_domain(domain)
        cfg = self.sites.get(d)
        if cfg:
            return {
                "domain": cfg.domain,
                "name": cfg.name,
                "login_url": cfg.login_url,
                "login_email": cfg.login_email,
                "login_password": cfg.login_password,
                "auto_login": cfg.auto_login
            }
        return {
            "domain": d,
            "name": d,
            "login_url": "",
            "login_email": "",
            "login_password": "",
            "auto_login": False
        }

    def save_auth_for_domain(
        self,
        domain: str,
        email: str,
        password: str,
        login_url: str = "",
        auto_login: bool = True,
        name: str = ""
    ) -> SiteParserConfig:
        """Lưu hoặc cập nhật thông tin đăng nhập cho một domain cụ thể."""
        d = self.get_domain(domain)
        if not d:
            raise ValueError("Domain website không hợp lệ!")
        if d in self.sites:
            cfg = self.sites[d]
            cfg.login_email = email.strip()
            cfg.login_password = password.strip()
            if login_url.strip():
                cfg.login_url = login_url.strip()
            cfg.auto_login = bool(auto_login)
            if name.strip():
                cfg.name = name.strip()
        else:
            cfg = SiteParserConfig(
                domain=d,
                name=name.strip() or d,
                login_email=email.strip(),
                login_password=password.strip(),
                login_url=login_url.strip(),
                auto_login=bool(auto_login)
            )
            self.sites[d] = cfg
        self.save()

        # Đồng bộ sang AUTH_CONFIG nếu là gia tộc vượng tài
        if d == "giatocvuongtai.com":
            try:
                from vtpate.config import AUTH_CONFIG
                AUTH_CONFIG["email"] = cfg.login_email
                AUTH_CONFIG["password"] = cfg.login_password
                AUTH_CONFIG["auto_login"] = cfg.auto_login
                if cfg.login_url:
                    AUTH_CONFIG["login_url"] = cfg.login_url
            except Exception:
                pass

        return cfg

    def list_accounts(self) -> List[Dict[str, Any]]:
        """Danh sách tài khoản đã cấu hình theo từng web."""
        results = []
        for d, cfg in self.sites.items():
            results.append({
                "domain": cfg.domain,
                "name": cfg.name,
                "login_url": cfg.login_url,
                "login_email": cfg.login_email,
                "login_password": cfg.login_password,
                "auto_login": cfg.auto_login,
                "has_credentials": bool(cfg.login_email and cfg.login_password)
            })
        return results

    def list_parsers(self) -> List[SiteParserConfig]:
        """Danh sách toàn bộ các parser hiện có."""
        return list(self.sites.values())

    @classmethod
    def auto_detect_from_html(
        cls,
        story_html: str,
        chapter_html: str = "",
        domain: str = ""
    ) -> SiteParserConfig:
        """
        Thuật toán phỏng đoán thông minh (Heuristics) giống plugin WebToEpub:
        Tự động phân tích DOM cây HTML để phát hiện các selector tối ưu nhất.
        """
        cfg = SiteParserConfig(domain=domain, name=f"Tự động ({domain})")
        story_soup = BeautifulSoup(story_html, "html.parser") if story_html else None
        chapter_soup = BeautifulSoup(chapter_html, "html.parser") if chapter_html else None

        # 1. Đoán Story Title
        if story_soup:
            for sel in FALLBACK_STORY_TITLE:
                elem = story_soup.select_one(sel)
                if elem:
                    txt = elem.get("content") if elem.name == "meta" else elem.get_text(strip=True)
                    if txt and len(txt) >= 2:
                        cfg.story_title_sel = sel
                        break

            # 2. Đoán Author
            for sel in FALLBACK_AUTHOR:
                elem = story_soup.select_one(sel)
                if elem:
                    txt = elem.get("content") if elem.name == "meta" else elem.get_text(strip=True)
                    if txt and len(txt) >= 2:
                        cfg.author_sel = sel
                        break

            # 3. Đoán Cover Image
            for sel in FALLBACK_COVER:
                elem = story_soup.select_one(sel)
                if elem:
                    src = elem.get("content") if elem.name == "meta" else (elem.get("src") or elem.get("data-src"))
                    if src and ("http" in src or src.startswith("/")):
                        cfg.cover_sel = sel
                        break

            # 4. Đoán Summary / Văn án
            for sel in FALLBACK_SUMMARY:
                elem = story_soup.select_one(sel)
                if elem and len(elem.get_text(strip=True)) > 20:
                    cfg.summary_sel = sel
                    break

            # 5. Đoán Chapter List Links
            best_ch_sel = ""
            max_ch_count = 0
            for sel in FALLBACK_CHAPTER_LIST:
                links = story_soup.select(sel)
                if len(links) > max_ch_count:
                    max_ch_count = len(links)
                    best_ch_sel = sel
            if max_ch_count >= 1:
                cfg.chapter_list_sel = best_ch_sel

            # 6. Đoán Nút chuyển trang (Next page) & Cơ chế phân trang
            for sel in [".pagination a", ".pager a", ".page-nav a", "button", "a"]:
                elems = story_soup.select(sel)
                for el in elems:
                    txt = el.get_text().strip().lower()
                    href = el.get("href", "")
                    if any(k in txt for k in ["sau", "tiếp", "trang sau", "next", ">", "»", "›"]):
                        cfg.next_page_sel = ".pagination .next a, a.next, a[rel='next']"
                        cfg.pagination_type = "next_button"
                        break
                    if any(k in txt for k in ["xem thêm", "tải thêm", "load more"]):
                        cfg.next_page_sel = "//button[contains(text(), 'Xem thêm') or contains(text(), 'Tải thêm')]"
                        cfg.pagination_type = "load_more"
                        break
                    # Kiểm tra mẫu URL trang (vd: trang-2, ?page=2)
                    if href:
                        if re.search(r'trang-(\d+)', href):
                            cfg.pagination_pattern = "trang-{page}/"
                            cfg.pagination_type = "url_pattern"
                            break
                        elif re.search(r'[?&]page=(\d+)', href):
                            cfg.pagination_pattern = "?page={page}"
                            cfg.pagination_type = "url_pattern"
                            break
                if cfg.next_page_sel or cfg.pagination_pattern:
                    break

        # 7. Đoán Chapter Title & Chapter Content từ HTML chương
        target_soup = chapter_soup or story_soup
        if target_soup:
            # Chapter Title
            for sel in FALLBACK_CHAPTER_TITLE:
                elem = target_soup.select_one(sel)
                if elem:
                    txt = elem.get_text(strip=True)
                    if txt and ("chương" in txt.lower() or "tiết" in txt.lower() or "chap" in txt.lower() or len(txt) > 3):
                        cfg.chapter_title_sel = sel
                        break

            # Chapter Content (Chọn vùng có nhiều text hoặc nhiều thẻ p nhất)
            best_content_sel = ""
            max_p_count = 0
            for sel in FALLBACK_CHAPTER_CONTENT:
                elem = target_soup.select_one(sel)
                if elem:
                    p_count = len(elem.find_all('p'))
                    text_len = len(elem.get_text(strip=True))
                    # Đánh giá theo số thẻ p hoặc độ dài text
                    score = p_count * 100 + text_len
                    if score > max_p_count:
                        max_p_count = score
                        best_content_sel = sel

            if best_content_sel:
                cfg.chapter_content_sel = best_content_sel

        return cfg
