"""
test_local_web.py - Automated Verification Suite for VTPATE Local Web App
Tests all backend modules, parsers, EPUB builder, crawler controls, and Flask endpoints.
"""

import os
import sys

current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

import unittest
import json

from vtpate.special_parsers import InkittSpecialParser, WattpadSpecialParser
from vtpate.crawler import StoryCrawler
from vtpate.format_processor import ContentFormatCleaner
from vtpate.epub_builder import EpubBuilder
from vtpate.web_server import app, controller


class TestLocalWebApp(unittest.TestCase):

    def setUp(self):
        self.client = app.test_client()

    def test_01_inkitt_parser_logic(self):
        """Test Inkitt URL detection and ID extraction."""
        self.assertTrue(InkittSpecialParser.can_handle("https://www.inkitt.com/stories/romance/123456"))
        self.assertTrue(InkittSpecialParser.can_handle("https://www.inkitt.com/stories/987654"))
        self.assertTrue(InkittSpecialParser.can_handle("inkitt://stories/555123"))
        self.assertFalse(InkittSpecialParser.can_handle("https://giatocvuongtai.com/stories/abc/"))

        self.assertEqual(InkittSpecialParser.extract_story_id("https://www.inkitt.com/stories/romance/123456"), "123456")
        self.assertEqual(InkittSpecialParser.extract_story_id("https://www.inkitt.com/stories/987654"), "987654")

    def test_02_wattpad_parser_logic(self):
        """Test Wattpad URL detection and cover image upgrading."""
        self.assertTrue(WattpadSpecialParser.can_handle("https://www.wattpad.com/story/1234567-my-novel"))
        self.assertTrue(WattpadSpecialParser.can_handle("https://www.wattpad.com/9876543-part-one"))
        self.assertFalse(WattpadSpecialParser.can_handle("https://giatocvuongtai.com/stories/abc/"))

        upgraded = WattpadSpecialParser.upgrade_cover_url("https://img.wattpad.com/cover/123-k128.jpg")
        self.assertIn("-k512", upgraded)

    def test_03_crawler_slug_extraction(self):
        """Test slug extraction for all domain types."""
        slug_gt = StoryCrawler.extract_slug("https://giatocvuongtai.com/stories/de-nhat-marketing/")
        self.assertEqual(slug_gt, "de-nhat-marketing")

        slug_inkitt = StoryCrawler.extract_slug("https://www.inkitt.com/stories/romance/888999")
        self.assertEqual(slug_inkitt, "inkitt_888999")

        slug_wattpad = StoryCrawler.extract_slug("https://www.wattpad.com/story/777666-my-story")
        self.assertEqual(slug_wattpad, "wattpad_777666")

    def test_04_format_cleaner(self):
        """Test HTML sanitization, pass chapter handling, and tag preservation."""
        raw_html = '<div class="content"><p>Đoạn 1 bình thường.</p><p style="display:none">Watermark ẩn</p><p>Đoạn 2 có <a href="http://link.com">link</a>.</p></div>'
        clean, stats = ContentFormatCleaner.clean_html_content(raw_html, remove_spam=True)
        self.assertIn("Đoạn 1 bình thường", clean)
        self.assertIn("Đoạn 2", clean)
        self.assertIn("<a href=", clean)
        self.assertNotIn("Watermark ẩn", clean)

        # Empty chapter should yield pass
        empty_clean, _ = ContentFormatCleaner.clean_html_content("<div></div>")
        self.assertIn("pass", empty_clean)

    def test_05_epub_builder(self):
        """Test creating a valid standard EPUB file."""
        builder = EpubBuilder()
        chapters = [
            {"num": 1, "title": "Chương 1: Mở Đầu", "content": "<p>Nội dung chương 1 tiếng Việt có dấu rất đẹp.</p>"},
            {"num": 2, "title": "Chương 2: Thử Nghiệm", "content": "<p>Nội dung chương 2 hoàn toàn hợp lệ.</p>"}
        ]
        story_info = {
            "name": "Truyện Test Web App",
            "author": "Tác Giả Kiểm Thử",
            "summary": "Văn án kiểm thử cấu trúc EPUB.",
            "status": "Hoàn thành"
        }
        os.makedirs("epubs", exist_ok=True)
        out_path = os.path.join("epubs", "test_app_story.epub")
        builder.create_epub(
            name="Truyện Test Web App",
            author="Tác Giả Kiểm Thử",
            chapters=chapters,
            filename=out_path,
            story_info=story_info
        )
        self.assertTrue(os.path.isfile(out_path))
        self.assertGreater(os.path.getsize(out_path), 1000)

    def test_06_flask_routes(self):
        """Test all core Flask endpoints."""
        # 1. Main frontend page
        resp_index = self.client.get("/")
        self.assertEqual(resp_index.status_code, 200)
        self.assertIn(b"VTPATE STUDIO", resp_index.data)

        # 2. Status API
        resp_status = self.client.get("/api/status")
        self.assertEqual(resp_status.status_code, 200)
        st_data = json.loads(resp_status.data)
        self.assertIn("is_crawling", st_data)
        self.assertIn("failed_chapters", st_data)

        # 3. Checkpoints API
        resp_cp = self.client.get("/api/checkpoints")
        self.assertEqual(resp_cp.status_code, 200)

        # 4. Parsers API
        resp_p = self.client.get("/api/parsers")
        self.assertEqual(resp_p.status_code, 200)

        # 5. Epubs API
        resp_epubs = self.client.get("/api/epubs")
        self.assertEqual(resp_epubs.status_code, 200)

        # 6. Retry failed chapters API
        resp_retry = self.client.post("/api/crawl/retry-failed", json={})
        self.assertEqual(resp_retry.status_code, 200)
        retry_data = json.loads(resp_retry.data)
        self.assertIn("message", retry_data)


if __name__ == "__main__":
    unittest.main()
