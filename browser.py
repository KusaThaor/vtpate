"""
Module quản lý Selenium WebDriver và mô phỏng các hành vi giống người dùng thật (Human Behavior).
"""

import os
import time
import random
import threading
import msvcrt
import ctypes
from typing import Optional
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.options import Options

from .config import TIMING, USER_AGENTS, BASE_URL, AUTH_CONFIG, CHROME_PROFILE_DIR


class PauseController:
    """
    Quản lý trạng thái Tạm dừng / Tiếp tục bằng phím Cách (Spacebar) và Yêu cầu Dừng khẩn cấp.
    Hỗ trợ phát hiện phím qua console buffer (msvcrt) và GetAsyncKeyState (Windows API).
    """
    def __init__(self):
        self.is_paused = False
        self._running = False
        self.stop_requested = False
        self._thread = None
        self._last_toggle_time = 0.0
        self._lock = threading.Lock()

    def start(self):
        """Bắt đầu lắng nghe phím Cách và làm mới cờ dừng."""
        self.stop_requested = False
        self.is_paused = False
        if self._thread and self._thread.is_alive():
            return
        self._running = True
        self._thread = threading.Thread(target=self._listen, daemon=True)
        self._thread.start()

    def stop(self):
        """Dừng lắng nghe phím và mở khóa tạm dừng."""
        self._running = False
        self.is_paused = False
        self.stop_requested = True

    def request_stop(self):
        """Yêu cầu dừng tiến trình ngay lập tức."""
        self.stop_requested = True
        self.is_paused = False

    def toggle_pause(self):
        """Đảo trạng thái tạm dừng với cooldown chống rung phím (debounce 0.4s)."""
        now = time.time()
        with self._lock:
            if now - self._last_toggle_time < 0.4:
                return
            self._last_toggle_time = now
            self.is_paused = not self.is_paused

            if self.is_paused:
                print("\n" + "=" * 64)
                print("⏸️  [TẠM DỪNG] ĐÃ TẠM DỪNG TIẾN TRÌNH CÀO TRUYỆN!")
                print("👉 Nhấn phím CÁCH (SPACE) một lần nữa để TIẾP TỤC...")
                print("=" * 64 + "\n")
            else:
                print("\n" + "=" * 64)
                print("▶️  [TIẾP TỤC] ĐANG TIẾP TỤC CÀO TRUYỆN...")
                print("=" * 64 + "\n")

    def _listen(self):
        user32 = ctypes.windll.user32
        while self._running:
            try:
                space_pressed = False

                # 1. Bắt phím Space từ console terminal buffer (CMD / PowerShell có focus)
                if msvcrt.kbhit():
                    ch = msvcrt.getwch()
                    if ch == ' ':
                        space_pressed = True

                # 2. Bắt phím Space vật lý khi cửa sổ Console hoặc Chrome truyện đang active
                if not space_pressed and (user32.GetAsyncKeyState(0x20) & 0x8000):
                    hwnd = user32.GetForegroundWindow()
                    if hwnd:
                        length = user32.GetWindowTextLengthW(hwnd)
                        if length > 0:
                            buff = ctypes.create_unicode_buffer(length + 1)
                            user32.GetWindowTextW(hwnd, buff, length + 1)
                            title = buff.value.lower()
                            if any(k in title for k in ['cmd', 'powershell', 'terminal', 'vtpate', 'python', 'vuongtai', 'vượng tài', 'gia tộc', 'chrome']):
                                space_pressed = True

                if space_pressed:
                    self.toggle_pause()
                    # Chờ nhả phím Space để tránh bị lặp lại khi nhấn giữ
                    while (user32.GetAsyncKeyState(0x20) & 0x8000) and self._running:
                        time.sleep(0.05)
                    # Xóa sạch các phím Space thừa trong bộ đệm console
                    while msvcrt.kbhit():
                        try:
                            msvcrt.getwch()
                        except Exception:
                            break
                    time.sleep(0.1)
                    continue
            except Exception:
                pass
            time.sleep(0.05)

    def wait_if_paused(self):
        """Chặn luồng khi đang ở trạng thái tạm dừng (sẽ thoát ngay nếu có lệnh dừng)."""
        while self.is_paused and self._running and not self.stop_requested:
            time.sleep(0.1)

    def sleep(self, seconds: float):
        """
        Sleep thông minh: có thể dừng ngay lập tức (trong 0.1s)
        khi người dùng bấm phím Cách để tạm dừng hoặc khi có yêu cầu dừng tiến trình.
        """
        elapsed = 0.0
        step = 0.1
        while elapsed < seconds and self._running and not self.stop_requested:
            self.wait_if_paused()
            if self.stop_requested:
                break
            time.sleep(min(step, seconds - elapsed))
            elapsed += step
        if not self.stop_requested:
            self.wait_if_paused()


class HumanBehavior:
    """Mô phỏng các hành vi đọc, nghỉ, scroll, click như người dùng thật."""

    def __init__(self, timing: Optional[dict] = None):
        self.timing = timing or TIMING
        self.pause_controller = PauseController()
        # Khởi tạo chu kỳ nghỉ dài ngẫu nhiên (15 đến 25 chương)
        self.chapters_since_long_break = 0
        self.next_long_break_target = random.randint(15, 25)

    @property
    def stop_requested(self) -> bool:
        if hasattr(self, 'pause_controller') and self.pause_controller:
            return self.pause_controller.stop_requested
        return False

    @stop_requested.setter
    def stop_requested(self, value: bool):
        if hasattr(self, 'pause_controller') and self.pause_controller:
            self.pause_controller.stop_requested = value

    def sleep(self, seconds: float):
        """Sleep có hỗ trợ tạm dừng ngay lập tức bằng phím Cách."""
        if hasattr(self, 'pause_controller') and self.pause_controller:
            self.pause_controller.sleep(seconds)
        else:
            time.sleep(seconds)

    def delay(self, min_sec: Optional[float] = None, max_sec: Optional[float] = None, bias: str = "normal") -> float:
        """Delay ngắn giống người cho các thao tác giao diện."""
        if min_sec is None:
            min_sec = self.timing["ui_min"]
        if max_sec is None:
            max_sec = self.timing["ui_max"]

        if bias == "long":
            t = random.triangular(min_sec, max_sec, max_sec * 0.75)
        elif bias == "short":
            t = random.triangular(min_sec, max_sec, min_sec + (max_sec - min_sec) * 0.25)
        else:
            t = random.uniform(min_sec, max_sec)

        self.sleep(t)
        return t

    def read_chapter_pause(self, word_count: Optional[int] = None) -> float:
        """
        Delay mô phỏng đọc xong 1 chương.
        Nếu có word_count: tính chính xác theo tốc độ đọc WPM (trung bình 540 từ/phút) kèm biến thiên tự nhiên.
        Nếu không có word_count: dùng khoảng thời gian mặc định.
        """
        if word_count and word_count > 0:
            target_wpm = self.timing.get("reading_wpm", 540)
            variance = self.timing.get("reading_wpm_variance", 0.15)
            min_wpm = target_wpm * (1.0 - variance)
            max_wpm = target_wpm * (1.0 + variance)

            actual_wpm = random.triangular(min_wpm, max_wpm, target_wpm)
            t = (word_count / actual_wpm) * 60.0

            min_floor = self.timing.get("read_min_floor", 15.0)
            t = max(min_floor, t)

            print(f"   📖 Đọc chương... {word_count:,} từ (~{t/60:.2f} phút @ {actual_wpm:.0f} từ/phút)")
        else:
            t = random.triangular(
                self.timing.get("read_min", 60.0),
                self.timing.get("read_max", 180.0),
                self.timing.get("read_min", 60.0) + (self.timing.get("read_max", 180.0) - self.timing.get("read_min", 60.0)) * 0.4
            )
            print(f"   📖 Đọc chương... ({t/60:.1f} phút)")

        self.sleep(t)
        return t

    def chapter_break(self) -> float:
        """
        Nghỉ giữa các chương dựa trên xác suất (chap_break_chance).
        Không phải chương nào đọc xong cũng nghỉ: có tỉ lệ đọc liền chương tiếp theo.
        """
        break_chance = self.timing.get("chap_break_chance", 0.35)

        # Tung xúc xắc theo xác suất
        if random.random() < break_chance:
            t = random.triangular(
                self.timing["chap_break_min"],
                self.timing["chap_break_max"],
                self.timing["chap_break_min"] + (self.timing["chap_break_max"] - self.timing["chap_break_min"]) * 0.3
            )
            print(f"   ⏸️  Nghỉ giữa chương: {t/60:.1f} phút")
            self.sleep(t)
            return t
        else:
            # Bỏ qua nghỉ giữa chương, chỉ chuyển trang nhanh (2 - 5 giây)
            quick_delay = random.uniform(2.0, 5.0)
            print(f"   ⏩ Đọc liền chương tiếp theo (chuyển trang {quick_delay:.1f}s, bỏ qua nghỉ)")
            self.sleep(quick_delay)
            return quick_delay

    def long_break(self, chapter_count: int = 0) -> bool:
        """
        Nghỉ dài định kỳ (chu kỳ 15-25 chương) dựa trên xác suất long_break_chance.
        """
        self.chapters_since_long_break += 1
        if self.chapters_since_long_break >= self.next_long_break_target:
            self.chapters_since_long_break = 0
            self.next_long_break_target = random.randint(15, 25)

            chance = self.timing.get("long_break_chance", 0.50)
            if random.random() < chance:
                t = random.uniform(self.timing["long_break_min"], self.timing["long_break_max"])
                print(f"\n   💤 Nghỉ dài định kỳ: {t/60:.1f} phút...")
                self.sleep(t)
                print("   ✅ Quay lại làm việc!\n")
                return True
            else:
                print(f"\n   ⏩ Đến chu kỳ ({self.next_long_break_target} chương) nhưng bỏ qua nghỉ dài (xác suất {chance:.0%}), đọc tiếp!\n")
                return False
        return False

    def scroll(self, driver, duration: Optional[float] = None, read_mode: bool = True):
        """Scroll trang mô phỏng thao tác cuộn mượt mà của người đọc."""
        if duration is None:
            duration = random.uniform(3.0, 8.0) if read_mode else random.uniform(1.0, 3.0)

        try:
            total_height = driver.execute_script("return document.body.scrollHeight")
            viewport = driver.execute_script("return window.innerHeight")
            current = 0
            start_time = time.time()

            while time.time() - start_time < duration and current < total_height - viewport:
                if read_mode:
                    step = random.randint(100, 300)
                else:
                    step = random.randint(250, 550)

                # Thi thoảng cuộn ngược lên một chút như người đang đọc lại
                if random.random() < 0.06 and current > 200:
                    back = random.randint(80, 250)
                    current = max(0, current - back)
                    driver.execute_script(f"window.scrollTo({{top: {current}, behavior: 'smooth'}});")
                    self.sleep(random.uniform(0.5, 1.2))

                current += step
                driver.execute_script(f"window.scrollTo({{top: {current}, behavior: 'smooth'}});")

                if read_mode:
                    if random.random() < 0.25:
                        self.sleep(random.uniform(2.0, 6.0))
                    else:
                        self.sleep(random.uniform(0.4, 1.5))
                else:
                    self.sleep(random.uniform(0.15, 0.5))

            if read_mode and random.random() < 0.5:
                driver.execute_script("window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'});")
                self.sleep(random.uniform(1.0, 3.0))
        except Exception:
            try:
                steps = random.randint(4, 10) if read_mode else random.randint(2, 5)
                for _ in range(steps):
                    driver.execute_script(f"window.scrollBy(0, {random.randint(150, 450)});")
                    self.sleep(random.uniform(0.3, 1.0) if read_mode else random.uniform(0.1, 0.4))
            except Exception:
                pass

    def click(self, driver, element):
        """Di chuyển chuột tới element và click tự nhiên."""
        try:
            driver.execute_script("arguments[0].scrollIntoView({block: 'center', behavior: 'smooth'});", element)
            self.sleep(random.uniform(0.6, 1.8))

            actions = ActionChains(driver)
            actions.move_to_element(element)
            actions.pause(random.uniform(0.3, 0.8))
            actions.click()
            actions.perform()
        except Exception:
            try:
                element.click()
            except Exception:
                driver.execute_script("arguments[0].click();", element)


class BrowserManager:
    """Quản lý vòng đời Chrome WebDriver và các cấu hình chống bot/stealth."""

    def __init__(self, user_agents: Optional[list] = None):
        self.user_agents = user_agents or USER_AGENTS
        self.driver: Optional[webdriver.Chrome] = None

    def setup_driver(self) -> webdriver.Chrome:
        """Khởi tạo Chrome với stealth headers, profile lưu trữ và anti-bot overrides."""
        chrome_options = Options()
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
        chrome_options.add_experimental_option("useAutomationExtension", False)
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--start-maximized")
        chrome_options.add_argument("--disable-web-security")
        chrome_options.add_argument("--disable-features=CalculateNativeWinOcclusion,VizDisplayCompositor")
        chrome_options.add_argument("--disable-background-timer-throttling")
        chrome_options.add_argument("--disable-backgrounding-occluded-windows")
        chrome_options.add_argument("--disable-renderer-backgrounding")
        chrome_options.add_argument("--disable-hang-monitor")
        chrome_options.add_argument(f"--user-agent={random.choice(self.user_agents)}")
        chrome_options.add_argument("--lang=vi-VN,vi,en-US,en")
        chrome_options.add_argument("--window-size=1366,768")
        chrome_options.add_argument("--disable-notifications")
        chrome_options.add_argument("--disable-popup-blocking")

        # Lưu profile Chrome để duy trì phiên đăng nhập và cookie
        if CHROME_PROFILE_DIR:
            os.makedirs(CHROME_PROFILE_DIR, exist_ok=True)
            chrome_options.add_argument(f"--user-data-dir={os.path.abspath(CHROME_PROFILE_DIR)}")

        chrome_options.add_experimental_option("prefs", {
            "credentials_enable_service": False,
            "profile.password_manager_enabled": False,
            "profile.default_content_setting_values.notifications": 2,
            "memory_saver": {"enabled": False},
        })

        driver = webdriver.Chrome(
            service=webdriver.chrome.service.Service(ChromeDriverManager().install()),
            options=chrome_options
        )

        # Che giấu đặc tính WebDriver qua CDP
        driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
            "source": """
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
                Object.defineProperty(navigator, 'languages', {get: () => ['vi-VN', 'vi', 'en-US', 'en']});
                window.chrome = {runtime: {}};
                Object.defineProperty(navigator, 'hardwareConcurrency', {get: () => 8});
                Object.defineProperty(navigator, 'deviceMemory', {get: () => 8});
            """
        })
        self.driver = driver
        return driver

    def is_driver_alive(self) -> bool:
        """Kiểm tra kết nối tới trình duyệt Chrome có còn hoạt động hay không."""
        if not self.driver:
            return False
        try:
            _ = self.driver.current_window_handle
            return True
        except Exception:
            return False

    def restart_driver(self) -> webdriver.Chrome:
        """Khởi động lại Chrome khi bị sập, đóng đột ngột hoặc mất kết nối DevTools."""
        print("\n🔄 [TỰ PHỤC HỒI] Đang tự động mở lại trình duyệt Chrome...")
        self.quit()
        time.sleep(2.0)
        new_driver = self.setup_driver()
        print("✅ [TỰ PHỤC HỒI] Trình duyệt Chrome đã sẵn sàng trở lại!")
        return new_driver

    def ensure_driver_alive(self) -> webdriver.Chrome:
        """Đảm bảo driver luôn còn sống trước mỗi thao tác."""
        if not self.is_driver_alive():
            return self.restart_driver()
        return self.driver

    def clear_session(self):
        """Xóa session cũ trong localStorage và cookie khi phiên hết hạn."""
        if not self.driver:
            return
        try:
            self.driver.execute_script("""
                try {
                    localStorage.removeItem('vuongtai-auth-session');
                    sessionStorage.clear();
                } catch(e) {}
            """)
            self.driver.delete_all_cookies()
        except Exception:
            pass

    def is_logged_in(self) -> bool:
        """Kiểm tra tài khoản đã đăng nhập chưa (qua localStorage, cookie hoặc phần tử UI)."""
        if not self.driver:
            return False

        try:
            curr_url = self.driver.current_url or ""
            # Nếu đang ở about:blank hoặc data:, chưa có context domain giatocvuongtai.com
            if curr_url.startswith("data:") or curr_url.startswith("about:") or not curr_url:
                return False

            # 0. Kiểm tra thông báo lỗi phiên hết hạn trên giao diện (popup, card thông báo)
            page_text = ""
            try:
                page_text = self.driver.page_source.lower()
            except Exception:
                pass

            if "phiên đăng nhập không hợp lệ hoặc đã hết hạn" in page_text or "không thể tải lịch hẹn" in page_text:
                return False

            # 1. Kiểm tra localStorage session và thời hạn JWT
            session_raw = self.driver.execute_script("return localStorage.getItem('vuongtai-auth-session');")
            if session_raw:
                try:
                    import json
                    sess = json.loads(session_raw)
                    token = sess.get("access_token")
                    if not token:
                        return False
                    expires_at = sess.get("expires_at")
                    if expires_at and float(expires_at) <= time.time():
                        # Token đã hết hạn!
                        return False
                    return True
                except Exception:
                    if "access_token" in session_raw:
                        return True
        except Exception:
            pass

        try:
            # 2. Kiểm tra cookie access_token
            cookies = self.driver.get_cookies()
            for c in cookies:
                if c.get("name") in ("access_token", "vuongtai_token", "auth_token") and c.get("value"):
                    exp = c.get("expiry")
                    if exp and float(exp) <= time.time():
                        return False
                    return True
        except Exception:
            pass

        try:
            # 3. Kiểm tra các phần tử giao diện người dùng
            user_selectors = [
                ".user-avatar", ".user-info", ".avatar", ".user-menu",
                "a[href*='/u?id=']", "a[href*='/profile']"
            ]
            for sel in user_selectors:
                elems = self.driver.find_elements(By.CSS_SELECTOR, sel)
                if any(el.is_displayed() for el in elems):
                    return True
        except Exception:
            pass

        return False

    def auto_login(
        self,
        email: Optional[str] = None,
        password: Optional[str] = None,
        login_url: Optional[str] = None,
        domain: Optional[str] = None
    ) -> bool:
        """Tự động điền email/username, mật khẩu và thực hiện đăng nhập theo từng web."""
        if not self.driver:
            return False

        email = (email or AUTH_CONFIG.get("email") or "").strip()
        password = (password or AUTH_CONFIG.get("password") or "").strip()

        if not email or not password:
            print("⚠️ Chưa có thông tin email hoặc mật khẩu để tự động đăng nhập!")
            return False

        # 1. Kiểm tra nếu đã đăng nhập từ trước
        if self.is_logged_in():
            print("✅ Tài khoản đã ở trạng thái đăng nhập sẵn!")
            return True

        # Xóa session cũ đã hết hạn hoặc không hợp lệ
        self.clear_session()

        target_domain = (domain or "").strip().lower()
        if not login_url:
            if target_domain and target_domain != "giatocvuongtai.com":
                login_url = f"https://{target_domain}/login"
            else:
                login_url = AUTH_CONFIG.get("login_url", f"{BASE_URL.rstrip('/')}/register")

        print(f"\n🔐 Đang tự động đăng nhập tài khoản: {email} trên {target_domain or 'website'} ({login_url})...")

        try:
            # Thử click nút 'ĐĂNG NHẬP LẠI' trên popup nếu có hiển thị
            try:
                relogin_btns = self.driver.find_elements(
                    By.XPATH,
                    "//button[contains(text(), 'ĐĂNG NHẬP LẠI') or contains(text(), 'Đăng nhập lại')] | //a[contains(text(), 'ĐĂNG NHẬP LẠI')]"
                )
                for btn in relogin_btns:
                    if btn.is_displayed():
                        btn.click()
                        time.sleep(1.5)
                        break
            except Exception:
                pass

            # Mở trang đăng ký / đăng nhập
            curr = self.driver.current_url or ""
            parsed_curr = curr.split("?")[0].rstrip("/")
            parsed_login = login_url.split("?")[0].rstrip("/")
            if parsed_curr != parsed_login and (not curr or "/register" not in curr):
                self.driver.get(login_url)
                time.sleep(2.0)

            # Nếu website tự động redirect về trang chủ (do session/cookie đã có hiệu lực)
            if self.is_logged_in():
                print("✅ Đã nhận diện phiên đăng nhập hợp lệ (Tự động redirect)!")
                return True

            wait = WebDriverWait(self.driver, 10)

            # Tìm ô email/username
            email_input = None
            email_selectors = [
                "#auth-email",
                "input[name='email']",
                "input[name='username']",
                "input[name='user']",
                "input[name='account']",
                "input[type='email']",
                "input[autocomplete='username']",
                "input[autocomplete='email']",
                "input[placeholder*='@']",
                "input[placeholder*='email' i]",
                "input[placeholder*='tài khoản' i]",
                "input[placeholder*='tên đăng nhập' i]",
                "input[placeholder*='username' i]"
            ]
            css_email = ", ".join(email_selectors)
            try:
                email_input = self.driver.find_element(By.CSS_SELECTOR, css_email)
            except Exception:
                # Nếu chưa thấy ô email, có thể đang ở tab Đăng ký -> bấm tab Đăng nhập
                try:
                    tab_btns = self.driver.find_elements(By.XPATH, "//button[contains(text(), 'Đăng nhập')] | //a[contains(text(), 'Đăng nhập')]")
                    for tb in tab_btns:
                        if tb.is_displayed():
                            tb.click()
                            time.sleep(0.6)
                            break
                except Exception:
                    pass

            if not email_input:
                email_input = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, css_email)))

            # Điền Email / Username
            email_input.clear()
            for char in email:
                email_input.send_keys(char)
                time.sleep(random.uniform(0.01, 0.03))

            time.sleep(random.uniform(0.2, 0.4))

            # Điền Mật khẩu
            pass_selectors = [
                "#auth-password",
                "input[type='password']",
                "input[name='password']",
                "input[name='pass']",
                "input[autocomplete='current-password']",
                "input[placeholder*='mật khẩu' i]",
                "input[placeholder*='password' i]"
            ]
            css_pass = ", ".join(pass_selectors)
            pass_input = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, css_pass)))
            pass_input.clear()
            for char in password:
                pass_input.send_keys(char)
                time.sleep(random.uniform(0.01, 0.03))

            time.sleep(random.uniform(0.3, 0.6))

            # Bấm nút submit Đăng nhập (loại trừ tab button type='button')
            submit_btn = None
            try:
                buttons = self.driver.find_elements(By.CSS_SELECTOR, "button[type='submit']")
                for b in buttons:
                    if b.is_displayed():
                        submit_btn = b
                        break
            except Exception:
                pass

            if not submit_btn:
                try:
                    buttons = self.driver.find_elements(By.CSS_SELECTOR, ".auth-button--primary, button.auth-button, button.btn-login, button[name='login'], button[id*='login']")
                    for b in buttons:
                        if b.is_displayed() and b.get_attribute("type") != "button":
                            submit_btn = b
                            break
                except Exception:
                    pass

            if submit_btn and submit_btn.is_enabled():
                submit_btn.click()
            else:
                pass_input.submit()

            print("   ⏳ Đã gửi thông tin đăng nhập, đang chờ phản hồi...")

            # Chờ xác thực thành công tối đa 12 giây
            start_time = time.time()
            while time.time() - start_time < 12:
                if self.is_logged_in():
                    print("✅ Tự động đăng nhập thành công!")
                    if "/register" in (self.driver.current_url or "") or "/login" in (self.driver.current_url or ""):
                        home_url = f"https://{target_domain}/" if target_domain else BASE_URL
                        self.driver.get(home_url)
                        time.sleep(1.0)
                    return True

                # Kiểm tra alert lỗi nếu có
                try:
                    alerts = self.driver.find_elements(By.CSS_SELECTOR, ".auth-alert, [role='alert'], .auth-error, .alert-danger")
                    for alert in alerts:
                        txt = alert.text.strip()
                        if alert.is_displayed() and txt:
                            print(f"   ⚠️ Phản hồi từ web: {txt}")
                except Exception:
                    pass

                time.sleep(0.8)

            # Kiểm tra lần cuối
            if self.is_logged_in():
                print("✅ Tự động đăng nhập thành công!")
                return True

        except Exception as e:
            print(f"⚠️ Quá trình tự động đăng nhập gặp lỗi: {e}")

        return False

    def ensure_logged_in_for_site(self, parser, interactive: bool = False) -> bool:
        """Đảm bảo tài khoản đã đăng nhập cho website của parser profile."""
        self.ensure_driver_alive()

        email = (getattr(parser, 'login_email', '') or "").strip()
        password = (getattr(parser, 'login_password', '') or "").strip()
        login_url = (getattr(parser, 'login_url', '') or "").strip()
        domain = getattr(parser, 'domain', '').lower() if getattr(parser, 'domain', None) else ""
        auto_login = getattr(parser, 'auto_login', False)

        # Fallback cho giatocvuongtai.com nếu chưa điền trong profile
        if not email and "giatocvuongtai.com" in domain:
            email = AUTH_CONFIG.get("email", "")
            password = AUTH_CONFIG.get("password", "")
            login_url = AUTH_CONFIG.get("login_url", "")
            auto_login = AUTH_CONFIG.get("auto_login", True)

        if not email or not password or not auto_login:
            return True

        # Nếu đang ở trang trống, mở domain để đọc cookie
        curr = self.driver.current_url or ""
        if domain and (curr.startswith("data:") or curr.startswith("about:") or not curr):
            self.driver.get(f"https://{domain}/")
            time.sleep(1.5)

        if self.is_logged_in():
            return True

        self.clear_session()
        return self.auto_login(email=email, password=password, login_url=login_url, domain=domain)

    def ensure_logged_in(self, interactive: bool = False) -> bool:
        """
        Đảm bảo driver đang mở và tài khoản đã được đăng nhập.
        Nếu chưa đăng nhập: tự động thực hiện đăng nhập.
        Chỉ yêu cầu input() thủ công khi interactive=True (chế độ CLI).
        """
        self.ensure_driver_alive()

        # Nếu đang ở trang trống (data: / about:blank), nạp trang chủ trước để đọc cookie/localStorage
        curr = self.driver.current_url or ""
        if curr.startswith("data:") or curr.startswith("about:") or not curr:
            self.driver.get(BASE_URL)
            time.sleep(1.5)

        # 1. Kiểm tra nếu đã đăng nhập sẵn
        if self.is_logged_in():
            return True

        # Nếu phiên đã hết hạn hoặc không hợp lệ -> xóa sạch session cũ
        self.clear_session()

        # 2. Tự động đăng nhập nếu có cấu hình
        if AUTH_CONFIG.get("auto_login") and AUTH_CONFIG.get("email") and AUTH_CONFIG.get("password"):
            if self.auto_login(AUTH_CONFIG["email"], AUTH_CONFIG["password"]):
                return True

        # 3. Chế độ CLI tương tác: cho phép người dùng đăng nhập tay
        if interactive:
            print("\n" + "=" * 70)
            print("🔐 VUI LÒNG ĐĂNG NHẬP THỦ CÔNG")
            print("=" * 70)
            print("1. Đăng nhập vào website trên trình duyệt vừa mở")
            print("2. Quay lại terminal và nhấn Enter")
            try:
                input("\nNhấn Enter khi đã đăng nhập xong...")
            except Exception:
                pass
            return self.is_logged_in()

        return False

    def wait_for_login(self, interactive: bool = True) -> bool:
        """Đảm bảo tài khoản đã đăng nhập (ưu tiên tự động, fallback thủ công nếu interactive=True)."""
        return self.ensure_logged_in(interactive=interactive)

    def quit(self):
        """Đóng an toàn trình duyệt."""
        if self.driver:
            try:
                self.driver.quit()
            except Exception:
                pass
            self.driver = None

