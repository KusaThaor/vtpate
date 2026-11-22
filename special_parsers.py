"""
special_parsers.py - Bộ parser chuyên biệt cho Inkitt và Wattpad trong VTPATE Python Studio.
- Inkitt: Bóc tách story_id, API nội bộ v2 (/api/2/stories/{id}, /chapters/{num}),
  giả lập mobile client (X-Requested-With: com.inkitt.android) để mở khóa truyện App-only,
  hỗ trợ bóc tách JSON __NEXT_DATA__ hoặc DOM web.
- Wattpad: Phân giải part_id sang groupId (story_id), lấy metadata API v3,
  tải nội dung chapter qua storytext / text_url, làm sạch <p data-p-id>,
  giữ ảnh minh họa, nhận diện chương trả phí (Paid Stories) an toàn,
  và tự động fallback sang Selenium driver khi bị mạng/nhà mạng chặn.
"""

import os
import re
import json
import time
from typing import Dict, Any, List, Optional, Tuple
from urllib.parse import urlparse, urljoin
import requests
from bs4 import BeautifulSoup


class InkittSpecialParser:
    """Parser chuyên biệt cho website & mobile stories của Inkitt."""

    MOBILE_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Inkitt/4.12.0",
        "X-Requested-With": "com.inkitt.android",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9,vi;q=0.8"
    }

    DESKTOP_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,vi;q=0.8"
    }

    @classmethod
    def can_handle(cls, url: str) -> bool:
        if not url:
            return False
        return "inkitt.com" in url.lower() or url.lower().startswith("inkitt://")

    @classmethod
    def extract_story_id(cls, url: str) -> Optional[str]:
        if not url:
            return None
        m = re.search(r'(?:inkitt\.com/stories(?:/[a-zA-Z0-9_-]+)?/|inkitt://stories/|inkitt\.com/stories/)(\d+)', url, re.I)
        if m:
            return m.group(1)
        m2 = re.search(r'inkitt(?:\.com)?/(?:stories/)?(\d+)', url, re.I)
        if m2:
            return m2.group(1)
        return None

    @classmethod
    def fetch_story_info(cls, url: str, driver=None) -> Dict[str, Any]:
        story_id = cls.extract_story_id(url)
        if not story_id:
            raise ValueError(f"Không nhận diện được story_id từ URL Inkitt: {url}")

        title = "Inkitt Story"
        author = "Đang cập nhật"
        summary = ""
        cover_url = ""
        status = "Đang cập nhật"
        chapters = []

        # 1. Gọi trực tiếp API v2 với Mobile Header
        api_url = f"https://www.inkitt.com/api/2/stories/{story_id}"
        try:
            resp = requests.get(api_url, headers=cls.MOBILE_HEADERS, timeout=12)
            if resp.status_code == 200:
                data = resp.json().get("response") or resp.json().get("story") or resp.json()
                if data and (data.get("title") or data.get("id")):
                    title = data.get("title") or title
                    user = data.get("user") or {}
                    author = user.get("username") or user.get("name") or author
                    summary = data.get("summary") or data.get("description") or ""
                    vert_cover = data.get("vertical_cover") or {}
                    cover_url = vert_cover.get("url_original") or vert_cover.get("url_medium") or vert_cover.get("url") or data.get("cover_url") or ""
                    status = "Hoàn thành" if data.get("completed") else "Đang cập nhật"
                    raw_chaps = data.get("chapters") or []
                    for idx, ch in enumerate(raw_chaps, 1):
                        ch_num = ch.get("chapter_number") or idx
                        ch_title = ch.get("name") or ch.get("title") or f"Chương {ch_num}"
                        ch_id = ch.get("id") or idx
                        chapters.append({
                            "num": ch_num,
                            "title": ch_title,
                            "url": f"https://www.inkitt.com/api/2/stories/{story_id}/chapters/{ch_id}",
                            "id": ch_id,
                            "story_id": story_id
                        })
                    return {
                        "name": title,
                        "author": author,
                        "summary": summary,
                        "cover_url": cover_url,
                        "status": status,
                        "total_chapters": len(chapters),
                        "chapters": chapters,
                        "story_id": story_id
                    }
        except Exception:
            pass

        # 2. Thử lấy qua HTML web SSR (__NEXT_DATA__ hoặc Selenium)
        html_text = ""
        try:
            web_url = f"https://www.inkitt.com/stories/{story_id}"
            resp = requests.get(web_url, headers=cls.DESKTOP_HEADERS, timeout=12)
            if resp.status_code == 200:
                html_text = resp.text
        except Exception:
            pass

        if not html_text and driver:
            try:
                driver.get(f"https://www.inkitt.com/stories/{story_id}")
                time.sleep(2.0)
                html_text = driver.page_source or ""
            except Exception:
                pass

        if html_text:
            soup = BeautifulSoup(html_text, "html.parser")
            # Kiểm tra __NEXT_DATA__
            next_script = soup.select_one("script#__NEXT_DATA__")
            if next_script and next_script.string:
                try:
                    js = json.loads(next_script.string)
                    story = (js.get("props", {}).get("pageProps", {}).get("story")) or {}
                    if story:
                        title = story.get("title") or title
                        user = story.get("user") or {}
                        author = user.get("username") or user.get("name") or author
                        summary = story.get("summary") or story.get("description") or ""
                        vert_cover = story.get("vertical_cover") or {}
                        cover_url = vert_cover.get("url") or story.get("cover_url") or ""
                        status = "Hoàn thành" if story.get("completed") else "Đang cập nhật"
                        raw_chaps = story.get("chapters") or []
                        for idx, ch in enumerate(raw_chaps, 1):
                            ch_num = ch.get("chapter_number") or idx
                            ch_title = ch.get("name") or ch.get("title") or f"Chương {ch_num}"
                            ch_id = ch.get("id") or idx
                            chapters.append({
                                "num": ch_num,
                                "title": ch_title,
                                "url": f"https://www.inkitt.com/api/2/stories/{story_id}/chapters/{ch_id}",
                                "id": ch_id,
                                "story_id": story_id
                            })
                        return {
                            "name": title,
                            "author": author,
                            "summary": summary,
                            "cover_url": cover_url,
                            "status": status,
                            "total_chapters": len(chapters),
                            "chapters": chapters,
                            "story_id": story_id
                        }
                except Exception:
                    pass

            # Fallback DOM web
            t_el = soup.select_one("h1.story-title, h1")
            if t_el:
                title = t_el.get_text(strip=True)
            a_el = soup.select_one(".author-name, .story-author a")
            if a_el:
                author = a_el.get_text(strip=True)
            cov_el = soup.select_one(".story-cover img, img.cover")
            if cov_el:
                cover_url = cov_el.get("src") or ""
            desc_el = soup.select_one(".story-summary, .story-description")
            if desc_el:
                summary = desc_el.get_text(strip=True)

        return {
            "name": title,
            "author": author,
            "summary": summary,
            "cover_url": cover_url,
            "status": status,
            "total_chapters": len(chapters),
            "chapters": chapters,
            "story_id": story_id
        }

    @classmethod
    def fetch_chapter_content(cls, url: str, chap_num: int = 1, driver=None) -> Tuple[str, str]:
        """Tải nội dung chương từ Inkitt API hoặc Web."""
        title = f"Chương {chap_num}"
        raw_text = ""

        # 1. Thử gọi API với header mobile
        try:
            resp = requests.get(url, headers=cls.MOBILE_HEADERS, timeout=15)
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    item = data.get("response") or data.get("chapter") or data
                    title = item.get("name") or item.get("title") or title
                    raw_text = item.get("text") or item.get("contentHtml") or item.get("content") or ""
                except Exception:
                    raw_text = resp.text
        except Exception:
            pass

        # 2. Nếu API không được, thử lấy qua Selenium
        if not raw_text and driver:
            try:
                driver.get(url)
                time.sleep(2.0)
                soup = BeautifulSoup(driver.page_source, "html.parser")
                t_el = soup.select_one("h2.chapter-title, h1.chapter-title, .chapter-title")
                if t_el:
                    title = t_el.get_text(strip=True)
                c_el = soup.select_one(".chapter-body, .chapter-text, #story-text, .story-text")
                if c_el:
                    raw_text = str(c_el)
            except Exception:
                pass

        if not raw_text:
            return title, "<p>pass</p>"

        # Chuẩn hóa văn bản thành các thẻ <p>
        if "<p" not in raw_text:
            paragraphs = [p.strip() for p in re.split(r'\n{2,}|\r\n\r\n', raw_text) if p.strip()]
            if not paragraphs:
                paragraphs = [p.strip() for p in raw_text.splitlines() if p.strip()]
            content_html = "".join([f"<p>{p}</p>" for p in paragraphs])
        else:
            from .format_processor import ContentFormatCleaner
            content_html, _ = ContentFormatCleaner.clean_html_content(raw_text)

        if not content_html or not content_html.strip():
            content_html = "<p>pass</p>"

        return title, content_html


class WattpadSpecialParser:
    """Parser chuyên biệt cho Wattpad stories & parts."""

    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/html, */*",
        "Referer": "https://www.wattpad.com/"
    }

    @classmethod
    def can_handle(cls, url: str) -> bool:
        if not url:
            return False
        return "wattpad.com" in url.lower()

    @classmethod
    def resolve_story_id(cls, url: str, driver=None) -> Optional[str]:
        if not url:
            return None

        # Trường hợp 1: URL truyện có dạng wattpad.com/story/12345678-title
        m = re.search(r'wattpad\.com/story/(\d+)', url, re.I)
        if m:
            return m.group(1)

        # Trường hợp 2: URL chương lẻ có dạng wattpad.com/98765432-part-title
        m_part = re.search(r'wattpad\.com/(\d+)', url, re.I)
        if m_part:
            part_id = m_part.group(1)
            api_resolve = f"https://www.wattpad.com/api/v3/story_parts/{part_id}?fields=groupId"
            try:
                resp = requests.get(api_resolve, headers=cls.HEADERS, timeout=10)
                if resp.status_code == 200:
                    group_id = resp.json().get("groupId")
                    if group_id:
                        return str(group_id)
            except Exception:
                pass

            # Fallback dùng Selenium driver nếu ISP chặn API
            if driver:
                try:
                    driver.get(api_resolve)
                    time.sleep(1.5)
                    src = driver.page_source or ""
                    m_json = re.search(r'"groupId":\s*(\d+)', src)
                    if m_json:
                        return m_json.group(1)
                except Exception:
                    pass

        return None

    @classmethod
    def upgrade_cover_url(cls, cover_url: str) -> str:
        if not cover_url:
            return ""
        if "-k512" in cover_url:
            return cover_url
        if re.search(r'-k\d+\.', cover_url):
            return re.sub(r'-k\d+\.', '-k512.', cover_url)
        return re.sub(r'(\.[a-zA-Z0-9]+)$', r'-k512\1', cover_url)

    @classmethod
    def fetch_story_info(cls, url: str, driver=None) -> Dict[str, Any]:
        story_id = cls.resolve_story_id(url, driver=driver)
        if not story_id:
            raise ValueError(f"Không thể giải mã story_id từ URL Wattpad: {url}")

        title = "Wattpad Story"
        author = "Đang cập nhật"
        summary = ""
        cover_url = ""
        status = "Đang cập nhật"
        chapters = []

        # 1. Gọi Wattpad API v3 stories
        api_url = f"https://www.wattpad.com/api/v3/stories/{story_id}?fields=id,title,description,cover,completed,user(name,username),parts(id,title,draft,text_url)"
        data = None
        try:
            resp = requests.get(api_url, headers=cls.HEADERS, timeout=12)
            if resp.status_code == 200:
                data = resp.json()
        except Exception:
            pass

        # Fallback driver nếu bị mạng chặn
        if not data and driver:
            try:
                driver.get(api_url)
                time.sleep(2.0)
                soup = BeautifulSoup(driver.page_source, "html.parser")
                pre_text = soup.select_one("pre")
                if pre_text:
                    data = json.loads(pre_text.get_text())
                else:
                    data = json.loads(soup.get_text())
            except Exception:
                pass

        if data:
            title = data.get("title") or title
            user = data.get("user") or {}
            author = user.get("name") or user.get("username") or author
            summary = data.get("description") or ""
            cover_url = cls.upgrade_cover_url(data.get("cover") or "")
            status = "Hoàn thành" if data.get("completed") else "Đang cập nhật"
            parts = data.get("parts") or []
            # Loại bỏ bản nháp và quảng cáo
            published = [p for p in parts if not p.get("draft") and not p.get("isAd")]
            for idx, p in enumerate(published, 1):
                p_id = p.get("id")
                chapters.append({
                    "num": idx,
                    "title": p.get("title") or f"Phần {idx}",
                    "url": f"https://www.wattpad.com/apiv2/storytext?id={p_id}",
                    "id": p_id,
                    "text_url": p.get("text_url")
                })

        return {
            "name": title,
            "author": author,
            "summary": summary,
            "cover_url": cover_url,
            "status": status,
            "total_chapters": len(chapters),
            "chapters": chapters,
            "story_id": story_id
        }

    @classmethod
    def fetch_chapter_content(cls, url: str, chap_num: int = 1, driver=None) -> Tuple[str, str]:
        """Tải và làm sạch nội dung chương Wattpad."""
        title = f"Chương {chap_num}"
        content_html = ""

        # Kiểm tra nếu url chứa storytext API
        is_api = "apiv2/storytext" in url
        raw = ""

        try:
            resp = requests.get(url, headers=cls.HEADERS, timeout=15)
            if resp.status_code == 403:
                # Chương trả phí (Paid Story)
                return title, "<p><em>[Chương trả phí - Chưa mở khóa]</em></p>"
            if resp.status_code == 200:
                raw = resp.text
        except Exception:
            pass

        # Fallback Selenium driver
        if not raw and driver:
            try:
                driver.get(url)
                time.sleep(2.0)
                soup = BeautifulSoup(driver.page_source, "html.parser")
                pre = soup.select_one("pre")
                if pre:
                    raw = pre.get_text()
                else:
                    # Đang ở trang web view
                    c_body = soup.select_one(".panel-reading, .story-text, #story-text, .main-body")
                    if c_body:
                        raw = str(c_body)
                    h_title = soup.select_one("h1.panel-title, h1")
                    if h_title:
                        title = h_title.get_text(strip=True)
            except Exception:
                pass

        if not raw:
            return title, "<p>pass</p>"

        # Kiểm tra nội dung trả phí trong HTML
        if "paid-story" in raw.lower() or "coin" in raw.lower() and "mở khóa" in raw.lower():
            return title, "<p><em>[Chương trả phí - Chưa mở khóa]</em></p>"

        # Làm sạch thẻ p data-p-id
        clean = re.sub(r'(<p\b[^>]*?)\s+data-p-id="[^"]*"', r'\1', raw)
        clean = re.sub(r'<(br|hr|img)([^>]*?)(?<!/)>', r'<\1\2/>', clean)

        from .format_processor import ContentFormatCleaner
        content_html, _ = ContentFormatCleaner.clean_html_content(clean)

        if not content_html or not content_html.strip():
            content_html = "<p>pass</p>"

        return title, content_html
