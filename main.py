"""
Điểm khởi chạy chính của chương trình.
"""

import sys
import os

# Đảm bảo đường dẫn module được nhận diện chính xác
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

# Đảm bảo UTF-8 cho console Windows
if sys.platform.startswith('win'):
    try:
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        if hasattr(sys.stderr, 'reconfigure'):
            sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

def main():
    if "--cli" in sys.argv or "-c" in sys.argv:
        from vtpate.cli import CLIApp
        app = CLIApp()
        app.run()
    elif "--gui" in sys.argv or "-g" in sys.argv:
        try:
            from vtpate.gui import run_gui
            run_gui()
        except Exception as e:
            print(f"⚠️ Không thể khởi chạy giao diện Desktop (GUI): {e}")
            from vtpate.web_server import run_web
            run_web()
    else:
        # Mặc định khởi chạy giao diện Web Local App (http://127.0.0.1:5000)
        from vtpate.web_server import run_web
        run_web()


if __name__ == "__main__":
    main()

