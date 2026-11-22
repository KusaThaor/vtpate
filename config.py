"""
Module chứa cấu hình mặc định cho crawler và xuất EPUB.
"""

import os
import random

BASE_URL = "https://giatocvuongtai.com/"

# Thư mục lưu file checkpoint (JSON)
CHECKPOINT_DIR = os.path.join(os.getcwd(), "checkpoints")
os.makedirs(CHECKPOINT_DIR, exist_ok=True)

# Thư mục lưu profile Chrome (duy trì session / cookie đăng nhập)
CHROME_PROFILE_DIR = os.path.join(os.getcwd(), ".chrome_profile")

# Cấu hình tự động đăng nhập
AUTH_CONFIG = {
    "auto_login": True,
    "email": "thanhsacvuduc123@gmail.com",
    "password": "Thaor0345333661.",
    "login_url": "https://giatocvuongtai.com/register",
}

# Cấu hình timing giả lập hành vi người dùng (giây)
TIMING = {
    # Delay ngắn giữa các thao tác UI
    "ui_min": 0.8,
    "ui_max": 2.5,
    
    # Tốc độ đọc truyện (tính theo số từ cào được)
    "reading_wpm": 650,             # Tốc độ đọc trung bình: 800 từ / phút
    "reading_wpm_variance": 0.05,   # Độ biến thiên tự nhiên ngẫu nhiên (+/- 15%)
    "read_min_floor": 15.0,         # Thời gian đọc tối thiểu (giây) phòng chương cực ngắn
    
    # Dự phòng nếu không đếm được số từ
    "read_min": 60.0,
    "read_max": 180.0,
    
    # Nghỉ giữa các chương (xác suất & thời gian)
    "chap_break_chance": 0.05,      # Xác suất nghỉ giữa chương (5%, không phải chương nào cũng nghỉ)
    "chap_break_min": 60.0,         # Thời gian nghỉ tối thiểu nếu nghỉ giữa chương (giây)
    "chap_break_max": 180.0,        # Thời gian nghỉ tối đa nếu nghỉ giữa chương (giây)
    
    # Nghỉ dài định kỳ (chu kỳ 15 - 25 chương)
    "long_break_chance": 0.01,      # Xác suất kích hoạt nghỉ dài khi chạm chu kỳ (1%, không phải chương nào cũng nghỉ)
    "long_break_min": 300.0,        # Thời gian nghỉ dài tối thiểu (giây)
    "long_break_max": 500.0,        # Thời gian nghỉ dài tối đa (giây)
}

# Cấu hình chế độ cào truyện (Crawl Engines)
CRAWL_ENGINES = {
    "human": {
        "name": "Chống Bot (Giả lập người đọc thật)",
        "description": "Mô phỏng đọc bài theo WPM (650 từ/phút), cuộn đọc tự nhiên, nghỉ dài định kỳ chống ban tài khoản.",
    },
    "web2epub": {
        "name": "Siêu Tốc WebToEpub (Tự động không giới hạn thời gian)",
        "description": "Cào tự động liên tục không giới hạn, trích xuất tức thì (~1s/chương), tốc độ tối đa như plugin WebToEpub.",
        "default_delay": 0.8,
    }
}

# Tùy chọn số chương khi chia nhỏ EPUB
SPLIT_OPTIONS = {
    "none":    0,
    "small":   100,
    "medium":  300,
    "large":   500,
    "xlarge":  1000,
}

# Danh sách User-Agents
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
]

# Định dạng CSS nhúng vào EPUB
EPUB_CSS = """
div.svg_outer { display: block; margin: 0; padding: 0; text-align: left; }
div.svg_inner { display: block; text-align: center; }
h1, h2 { text-align: center; margin-bottom: 10%; margin-top: 10%; }
h3, h4, h5, h6 { text-align: center; margin-bottom: 15%; margin-top: 10%; }
ol, ul { padding-left: 8%; }
body { margin: 2%; }
p { overflow-wrap: break-word; line-height: 1.6; }
dd, dt, dl { padding: 0; margin: 0; }
img { display: block; min-height: 1em; max-height: 100%; max-width: 100%; margin: 2% auto; }
img.inline { display: inline; min-height: 1em; margin: 0; }
.thumbcaption { display: block; font-size: 0.9em; padding: 0 5%; }
hr { color: black; background-color: black; height: 2px; }
a:link { text-decoration: none; color: #0B0080; }
a:visited { text-decoration: none; }
a:hover { text-decoration: underline; }
a:active { text-decoration: underline; }
table { width: 90%; border-collapse: collapse; margin: 1em auto; }
table, th, td { border: 1px solid black; }
.webToEpub-author-note { border: 1px solid black; padding: 0.5em; }
.intro-container { padding: 10px; }
.intro-title { font-size: 1.8em; text-align: center; margin-bottom: 0.5em; color: #333; font-weight: bold; }
.intro-meta { background: #f8f9fa; border-left: 4px solid #79508f; padding: 12px 16px; margin: 18px 0; }
.intro-meta p { margin: 6px 0; line-height: 1.5; font-size: 0.95em; }
.intro-summary-section { margin-top: 25px; }
.intro-summary-section h2 { text-align: left; border-bottom: 2px solid #79508f; padding-bottom: 8px; margin: 15px 0 10px 0; font-size: 1.3em; }
.intro-summary-content { line-height: 1.7; font-size: 1em; }
.intro-summary-content p { margin: 8px 0; text-indent: 1.5em; }
"""

