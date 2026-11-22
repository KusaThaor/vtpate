"""
Module quản lý lưu trữ và khôi phục tiến trình cào truyện (checkpoint).
"""

import os
import json
import time
from typing import Optional, Dict, Any, List
from .config import CHECKPOINT_DIR, BASE_URL


class CheckpointManager:
    """Quản lý lưu và đọc trạng thái checkpoint dưới dạng JSON."""

    def __init__(self, checkpoint_dir: str = CHECKPOINT_DIR):
        self.checkpoint_dir = checkpoint_dir
        os.makedirs(self.checkpoint_dir, exist_ok=True)

    def get_path(self, slug: str) -> str:
        """Lấy đường dẫn đầy đủ tới file JSON checkpoint của truyện theo slug."""
        return os.path.join(self.checkpoint_dir, f"{slug}.json")

    def exists(self, slug: str) -> bool:
        """Kiểm tra truyện đã có checkpoint chưa."""
        return os.path.exists(self.get_path(slug))

    def save(
        self,
        slug: str,
        name: str,
        author: str,
        chapters_done: List[Dict[str, Any]],
        all_chapters: List[Dict[str, Any]],
        last_index: int,
        story_info: Optional[Dict[str, Any]] = None,
        story_url: Optional[str] = None,
        status: Optional[str] = None
    ) -> None:
        """Lưu trạng thái hiện tại vào file JSON."""
        resolved_status = status or (story_info or {}).get("status", "Đang cập nhật")
        data = {
            "slug": slug,
            "name": name,
            "author": author,
            "status": resolved_status,
            "story_url": story_url or f"{BASE_URL.rstrip('/')}/stories/{slug}/",
            "chapters": chapters_done,
            "all_chapters": all_chapters,
            "last_index": last_index,
            "story_info": story_info or {},
            "saved_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        with open(self.get_path(slug), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"   💾 Đã lưu checkpoint ({len(chapters_done)}/{len(all_chapters)} chương | Trạng thái: {resolved_status})")

    def load(self, slug: str) -> Optional[Dict[str, Any]]:
        """Đọc dữ liệu checkpoint nếu tồn tại, trả về None nếu không có hoặc lỗi."""
        path = self.get_path(slug)
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"⚠️ Lỗi khi đọc checkpoint {slug}: {e}")
                return None
        return None

    def delete(self, slug: str) -> bool:
        """Xóa file checkpoint sau khi hoàn thành."""
        path = self.get_path(slug)
        if os.path.exists(path):
            try:
                os.remove(path)
                return True
            except Exception:
                pass
        return False

    def list_checkpoints(self) -> List[Dict[str, Any]]:
        """
        Quét toàn bộ thư mục checkpoints và trả về danh sách tóm tắt của tất cả các file checkpoint.
        """
        results = []
        if not os.path.exists(self.checkpoint_dir):
            return results

        for fname in os.listdir(self.checkpoint_dir):
            if fname.endswith(".json"):
                path = os.path.join(self.checkpoint_dir, fname)
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        slug = data.get("slug") or fname[:-5]
                        chapters_done = len(data.get("chapters", []))
                        all_chapters = len(data.get("all_chapters", []))
                        is_full = (chapters_done >= all_chapters and all_chapters > 0)
                        story_url = data.get("story_url") or f"{BASE_URL.rstrip('/')}/stories/{slug}/"

                        status = data.get("status") or (data.get("story_info") or {}).get("status", "Đang cập nhật")
                        results.append({
                            "slug": slug,
                            "name": data.get("name", slug),
                            "author": data.get("author", "Chưa rõ"),
                            "status": status,
                            "story_url": story_url,
                            "crawled_count": chapters_done,
                            "total_count": all_chapters,
                            "last_index": data.get("last_index", chapters_done),
                            "saved_at": data.get("saved_at", "Chưa rõ"),
                            "is_full": is_full,
                            "path": path
                        })
                except Exception as e:
                    print(f"⚠️ Lỗi khi đọc file checkpoint {fname}: {e}")

        # Sắp xếp các truyện mới lưu gần nhất lên đầu
        results.sort(key=lambda x: x.get("saved_at", ""), reverse=True)
        return results

    def get_unfinished_checkpoints(self) -> List[Dict[str, Any]]:
        """
        Lấy danh sách các truyện cần cào tiếp hoặc theo dõi chương mới:
        - Truyện có trạng thái 'Đang cập nhật' (cần theo dõi chương mới kể cả khi đã cào đủ).
        - Hoặc truyện chưa cào full (tiến độ chưa đạt 100%).
        """
        all_cp = self.list_checkpoints()
        return [cp for cp in all_cp if (cp.get("status") == "Đang cập nhật" or not cp["is_full"])]

