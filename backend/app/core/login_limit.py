"""
Limit on failed logins against password guessing, kept in memory (a restart clears it).
An e-mail is locked after 5 failed attempts within 15 minutes (even for the right password), an IP
address after 30 (guessing many accounts from one place). A successful login clears the e-mail.
"""
import threading
import time
from collections import defaultdict, deque

WINDOW = 15 * 60
MAX_PER_EMAIL = 5
MAX_PER_IP = 30

_failures = defaultdict(deque)  # key -> times of failed attempts
_lock = threading.Lock()


def _recent(key: str, now: float) -> deque:
    attempts = _failures[key]
    while attempts and attempts[0] <= now - WINDOW:
        attempts.popleft()
    return attempts


def is_locked(email: str, ip: str) -> bool:
    now = time.monotonic()
    with _lock:
        return (len(_recent(f"email:{email.lower()}", now)) >= MAX_PER_EMAIL
                or len(_recent(f"ip:{ip}", now)) >= MAX_PER_IP)


def record_failure(email: str, ip: str) -> None:
    now = time.monotonic()
    with _lock:
        _recent(f"email:{email.lower()}", now).append(now)
        _recent(f"ip:{ip}", now).append(now)


def record_success(email: str) -> None:
    with _lock:
        _failures.pop(f"email:{email.lower()}", None)
