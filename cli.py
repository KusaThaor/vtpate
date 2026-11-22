"""
Module giao diện dòng lệnh (CLI), điều phối tương tác và luồng chạy của ứng dụng.
"""

import traceback
from typing import List, Tuple, Optional
from .config import BASE_URL
from .browser import BrowserManager, HumanBehavior
from .checkpoint import CheckpointManager
from .epub_builder import EpubBuilder
from .crawler import StoryCrawler


class CLIApp:
    """Ứng dụng dòng lệnh điều khiển quy trình cào truyện và xuất EPUB."""

    def __init__(self):
        self.browser_manager = BrowserManager()
        self.human = HumanBehavior()
        self.checkpoint_manager = CheckpointManager()
        self.epub_builder = EpubBuilder()
        self.crawler = StoryCrawler(
            browser_manager=self.browser_manager,
            human=self.human,
            checkpoint_manager=self.checkpoint_manager,
            epub_builder=self.epub_builder,
            base_url=BASE_URL
        )
        self.all_created_files: List[str] = []

    def show_banner(self):
        """Hiển thị thông tin giới thiệu và hướng dẫn."""
        print("=" * 72)
        print("📚 CRAWL TRUYỆN TỪ VUONGTAI.SPACE -> EPUB (Modular Version)")
        print("=" * 72)
        print("\n✨ Chế độ PHIÊN (Session Mode):")
        print("   - Mỗi lần chạy crawl 1 lượng chương vừa phải (VD: 20 chương)")
        print("   - Tự động lưu checkpoint, tắt cmd hoặc máy tính thoải mái")
        print("   - Mở lại chạy tiếp tục, không mất dữ liệu đã cào")
        print("   - Khi crawl đủ chỉ tiêu → tự tạo EPUB + dọn checkpoint")
        print("")
        print("⏱️  Tham khảo thời gian:")
        print("   - Mỗi chương ~5-12 phút (cả đọc + nghỉ chống ban IP)")
        print("   - 20 chương ≈ 2-4 tiếng")
        print("   - 50 chương ≈ 5-10 tiếng (chạy qua đêm)")
        print("")

    def ask_slugs(self) -> List[str]:
        """
        Hỏi người dùng danh sách URL hoặc slug truyện.
        Tự động hiển thị các truyện chưa cào full từ checkpoint để người dùng lựa chọn.
        """
        while True:
            unfinished = self.checkpoint_manager.get_unfinished_checkpoints()

            print("\n" + "=" * 72)
            if unfinished:
                print("💾 PHÁT HIỆN TRUYỆN ĐANG CÀO DỞ DANG / CẦN CẬP NHẬT:")
                print("=" * 72)
                for idx, cp in enumerate(unfinished, 1):
                    total_str = f"{cp['total_count']}" if cp['total_count'] > 0 else "?"
                    pct_str = f"({cp['crawled_count'] / cp['total_count'] * 100:.1f}%)" if cp['total_count'] > 0 else ""
                    st = cp.get('status', 'Đang cập nhật')
                    status_badge = "🔄 [ĐANG CẬP NHẬT]" if st == "Đang cập nhật" else "✅ [HOÀN THÀNH]"
                    print(f"  [{idx}] 📖 {cp['name']} {status_badge}")
                    print(f"      ✍️  Tác giả: {cp['author']}")
                    print(f"      📊 Tiến độ: {cp['crawled_count']}/{total_str} chương {pct_str} | Trạng thái: {st}")
                    print(f"      🕒 Lưu lúc: {cp['saved_at']}")
                    print(f"      🔗 Slug: {cp['slug']}")
                    print()
                print("-" * 72)
                print(f"👉 Nhập số [1-{len(unfinished)}] để TIẾP TỤC cào truyện (chọn nhiều: VD 1, 2 hoặc 'all')")
                print("👉 Nhập 'check <số>' (VD: check 1 hoặc check all) để KIỂM TRA CHƯƠNG MỚI trên web")
                print("👉 Hoặc dán LINK / SLUG truyện mới để cào truyện mới")
                print("👉 Nhập 'del <số>' (VD: del 1) để XOÁ checkpoint không cào nữa")
                print("👉 Nhập 'exit' để thoát")
                print("=" * 72)
            else:
                print("📝 NHẬP DANH SÁCH TRUYỆN CẦN CRAWL:")
                print("   - Nhập link hoặc slug truyện (nhiều truyện cách nhau bằng dấu phẩy)")
                print("   - Nhập 'exit' để thoát")
                print("=" * 72)

            user_input = input("\n👉 ").strip()
            if not user_input:
                continue

            if user_input.lower() in ['exit', 'quit', 'thoat']:
                return []

            # 1. Lệnh xóa checkpoint: del <số> / del all / xoa <số>
            if user_input.lower().startswith("del ") or user_input.lower().startswith("xoa "):
                parts = user_input.split()
                if len(parts) >= 2:
                    arg = parts[1].strip()
                    if arg.lower() == "all":
                        confirm = input("⚠️ Bạn có chắc muốn xóa TẤT CẢ checkpoint? (y/n): ").strip().lower()
                        if confirm == 'y':
                            for cp in unfinished:
                                self.checkpoint_manager.delete(cp['slug'])
                            print("🗑️ Đã xóa toàn bộ checkpoint!")
                        continue
                    try:
                        choice_idx = int(arg) - 1
                        if 0 <= choice_idx < len(unfinished):
                            target_cp = unfinished[choice_idx]
                            confirm = input(f"⚠️ Xác nhận xóa checkpoint truyện '{target_cp['name']}'? (y/n) [n]: ").strip().lower()
                            if confirm == 'y':
                                self.checkpoint_manager.delete(target_cp['slug'])
                                print(f"🗑️ Đã xóa checkpoint '{target_cp['slug']}' thành công!")
                        else:
                            print(f"❌ Số thứ tự không hợp lệ (1 - {len(unfinished)}).")
                    except ValueError:
                        self.checkpoint_manager.delete(arg)
                        print(f"🗑️ Đã xóa checkpoint '{arg}'!")
                continue

            # 1.5. Lệnh kiểm tra cập nhật trên web: check <số> / check all
            if user_input.lower().startswith("check ") or user_input.lower() == "check":
                parts = user_input.split()
                arg = parts[1].strip() if len(parts) >= 2 else "all"
                targets = []
                if arg.lower() in ["all", "tat ca"]:
                    targets = unfinished
                else:
                    try:
                        c_idx = int(arg) - 1
                        if 0 <= c_idx < len(unfinished):
                            targets = [unfinished[c_idx]]
                        else:
                            print(f"❌ Số thứ tự không hợp lệ (1 - {len(unfinished)}).")
                    except ValueError:
                        print("❌ Cú pháp: check <số thứ tự> hoặc check all")
                
                for t in targets:
                    res = self.crawler.check_story_update(t['slug'])
                    if res.get('success'):
                        print(f"\n📢 Kết quả kiểm tra '{res['name']}':")
                        print(f"   Trạng thái web: {res['new_status']} (Cũ: {res['old_status']})")
                        print(f"   Tổng số chương web: {res['new_total']} (Đã cào: {res['crawled_count']})")
                        if res['new_chapters_count'] > 0:
                            print(f"   ✨ Có {res['new_chapters_count']} chương mới!")
                        else:
                            print("   ℹ️ Chưa có chương mới.")
                    else:
                        print(f"   ❌ {res.get('message')}")
                continue

            # 2. Chọn toàn bộ truyện dở dang
            if unfinished and user_input.lower() in ['all', 'tat ca']:
                return [cp['slug'] for cp in unfinished]

            # 3. Chọn số thứ tự từ danh sách dở dang
            raw_parts = [p.strip() for p in user_input.split(',') if p.strip()]
            if unfinished and all(p.isdigit() and 1 <= int(p) <= len(unfinished) for p in raw_parts):
                selected_slugs = []
                for p in raw_parts:
                    cp_idx = int(p) - 1
                    selected_slugs.append(unfinished[cp_idx]['slug'])
                return selected_slugs

            # 4. Nhập link hoặc slug mới
            slugs = [self.crawler.extract_slug(p) for p in raw_parts if self.crawler.extract_slug(p)]
            if slugs:
                return slugs
            else:
                print("❌ Đầu vào không hợp lệ. Vui lòng chọn số thứ tự hoặc nhập link truyện hợp lệ!")

    def ask_target_mode(self) -> Tuple[str, int]:
        """Hỏi đích đến cuối cùng của truyện (FULL / TEST / Tùy chỉnh)."""
        print("\n🎯 ĐÍCH CUỐI CÙNG CỦA TRUYỆN:")
        print("   1. FULL - lấy hết truyện (qua nhiều phiên)")
        print("   2. TEST - chỉ 5 chương đầu")
        print("   3. Tùy chỉnh số chương")

        choice = input("Chọn (1/2/3) [Mặc định 1]: ").strip() or "1"
        custom_chap = 5
        if choice == "3":
            try:
                custom_chap = int(input("Tổng số chương muốn crawl: "))
            except Exception:
                custom_chap = 5
        return choice, custom_chap

    def ask_session_limit(self) -> Optional[int]:
        """Hỏi số chương muốn cào trong phiên hiện tại."""
        print("\n⏱️  SỐ CHƯƠNG MỖI PHIÊN (mỗi lần chạy script):")
        print("   - 20 chương ≈ 2-4 tiếng")
        print("   - 50 chương ≈ 5-10 tiếng")
        print("   - 0 = không giới hạn (crawl hết trong 1 phiên)")

        session_input = input("Số chương mỗi phiên [Mặc định 20]: ").strip()
        if session_input == "":
            session_limit = 20
        elif session_input == "0":
            session_limit = None
        else:
            try:
                session_limit = int(session_input)
                if session_limit <= 0:
                    session_limit = None
            except Exception:
                session_limit = 20

        if session_limit:
            print(f"   → Mỗi phiên crawl tối đa {session_limit} chương")
        else:
            print(f"   → Crawl hết trong 1 phiên")
        return session_limit

    def ask_split_size(self) -> int:
        """Hỏi chế độ chia nhỏ file EPUB."""
        print("\n📦 CHẾ ĐỘ CHIA FILE EPUB:")
        print("   0. Không chia")
        print("   1. 100 chương/file")
        print("   2. 300 chương/file")
        print("   3. 500 chương/file (khuyên dùng)")
        print("   4. 1000 chương/file")
        print("   5. Tùy chỉnh")

        split_choice = input("Chọn (0-5) [Mặc định 3]: ").strip() or "3"
        split_size = 500
        if split_choice == "0":
            split_size = 0
        elif split_choice == "1":
            split_size = 100
        elif split_choice == "2":
            split_size = 300
        elif split_choice == "3":
            split_size = 500
        elif split_choice == "4":
            split_size = 1000
        elif split_choice == "5":
            try:
                split_size = int(input("Nhập số chương mỗi file: "))
            except Exception:
                split_size = 500

        if split_size > 0:
            print(f"   → Chia mỗi file {split_size} chương")
        else:
            print(f"   → Không chia, 1 file duy nhất")
        return split_size

    def ask_crawl_engine(self) -> Tuple[str, float]:
        """Hỏi chế độ cào: Chống bot giả lập hay Siêu tốc WebToEpub."""
        print("\n⚡ CHỌN CƠ CHẾ CÀO (CRAWL ENGINE):")
        print("   1. 🛡️ Chống Bot / Giả lập người đọc thật (WPM 650, cuộn đọc, nghỉ dài chống ban IP) [Mặc định]")
        print("   2. ⚡ Siêu Tốc WebToEpub (Tự động cào không giới hạn thời gian đọc, trích xuất tức thì)")

        eng_choice = input("Chọn (1-2) [Mặc định 1]: ").strip() or "1"
        if eng_choice == "2":
            delay_input = input("Nhập delay giữa các chương (giây) [Mặc định 0.8]: ").strip()
            try:
                fast_delay = float(delay_input) if delay_input else 0.8
            except Exception:
                fast_delay = 0.8
            print(f"   → Chế độ: Siêu Tốc WebToEpub (delay: {fast_delay:.1f}s)")
            return "web2epub", fast_delay
        else:
            print("   → Chế độ: Chống Bot (Giả lập người đọc thật)")
            return "human", 0.8

    def run(self):
        """Khởi chạy ứng dụng."""
        self.show_banner()

        print("🚀 Đang khởi động trình duyệt...")
        driver = self.browser_manager.setup_driver()
        print("✅ Trình duyệt đã mở!\n")

        print("🔗 Đang mở trang chủ...")
        driver.get(BASE_URL)
        self.human.delay(2.0, 4.0)
        self.human.scroll(driver, duration=2.5, read_mode=False)

        if not self.browser_manager.wait_for_login():
            print("❌ Không thể xác nhận đăng nhập. Thoát.")
            self.browser_manager.quit()
            return

        print("\n✅ Đăng nhập thành công!")
        print("-" * 72)

        try:
            while True:
                slugs = self.ask_slugs()
                if not slugs:
                    print("👋 Tạm biệt!")
                    break

                print(f"\n📊 Nhận diện {len(slugs)} truyện.")

                choice, custom_chap = self.ask_target_mode()
                engine, fast_delay = self.ask_crawl_engine()
                session_limit = self.ask_session_limit()
                split_size = self.ask_split_size()

                for idx, slug in enumerate(slugs, 1):
                    cp = self.checkpoint_manager.load(slug)
                    if cp and cp.get("story_url"):
                        story_url = cp["story_url"]
                    else:
                        story_url = f"{BASE_URL.rstrip('/')}/stories/{slug}/"
                    print(f"\n[{idx}/{len(slugs)}] 🔗 {story_url}")

                    try:
                        files = self.crawler.crawl_story(
                            story_url=story_url,
                            slug=slug,
                            global_mode=choice,
                            global_custom_chap=custom_chap,
                            split_size=split_size,
                            session_limit=session_limit,
                            crawl_engine=engine,
                            fast_delay=fast_delay
                        )
                        if files:
                            self.all_created_files.extend(files)
                    except Exception as e:
                        print(f"❌ Lỗi khi crawl {slug}: {e}")
                        traceback.print_exc()

                    print("\n" + "-" * 60)

                print(f"\n🎉 Kết thúc lượt chạy!")
                cont = input("\n🔄 Chạy tiếp phiên nữa? (y/n) [n]: ").strip().lower()
                if cont != 'y':
                    break

        except KeyboardInterrupt:
            print("\n\n⚠️ Người dùng dừng chương trình!")
            print("💾 Checkpoint đã lưu an toàn. Chạy lại để tiếp tục.")
        except Exception as e:
            print(f"\n❌ Lỗi ngoài ý muốn: {e}")
            traceback.print_exc()
        finally:
            close = input("\n🔒 Đóng trình duyệt? (y/n) [y]: ").strip().lower()
            if close != 'n':
                self.browser_manager.quit()
                print("🔒 Đã đóng trình duyệt.")
            else:
                print("💡 Trình duyệt vẫn mở.")

            if self.all_created_files:
                print(f"\n📚 TỔNG KẾT - {len(self.all_created_files)} file đã tạo:")
                for f in self.all_created_files:
                    print(f"   ✅ {f}")

