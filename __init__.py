"""
Package vtpate: Bộ công cụ cào truyện từ giatocvuongtai.com và đóng gói file EPUB.
"""

from .config import (
    BASE_URL,
    TIMING,
    CRAWL_ENGINES,
    SPLIT_OPTIONS,
    USER_AGENTS,
    EPUB_CSS,
    CHECKPOINT_DIR,
)
from .browser import BrowserManager, HumanBehavior
from .checkpoint import CheckpointManager
from .epub_builder import EpubBuilder
from .crawler import StoryCrawler
from .special_parsers import InkittSpecialParser, WattpadSpecialParser
from .cli import CLIApp
from .format_processor import ContentFormatCleaner, EpubFileCleaner

__all__ = [
    "BASE_URL",
    "TIMING",
    "CRAWL_ENGINES",
    "SPLIT_OPTIONS",
    "USER_AGENTS",
    "EPUB_CSS",
    "CHECKPOINT_DIR",
    "BrowserManager",
    "HumanBehavior",
    "CheckpointManager",
    "EpubBuilder",
    "StoryCrawler",
    "CLIApp",
    "ContentFormatCleaner",
    "EpubFileCleaner",
]

