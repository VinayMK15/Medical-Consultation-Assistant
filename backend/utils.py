"""
utils.py — Slot Engine Helpers for the MedAssist Time-Slot System.

Provides deterministic, datetime-based generation of 30-minute appointment
slots from a doctor's shift window.
"""

from datetime import datetime, timedelta


def generate_time_slots(
    start_time_str: str,
    end_time_str: str,
    interval_minutes: int = 30,
) -> list[str]:
    """
    Generate a sorted list of "HH:MM" slot strings between *start_time_str*
    and *end_time_str* (exclusive), spaced by *interval_minutes*.

    Args:
        start_time_str: Shift start in "HH:MM" format (e.g. "09:00").
        end_time_str:   Shift end   in "HH:MM" format (e.g. "17:00").
        interval_minutes: Gap between consecutive slots (default 30).

    Returns:
        A list such as ["09:00", "09:30", "10:00", ..., "16:30"].
        The last slot will always be *before* end_time_str so the
        appointment fits within the shift window.

    Raises:
        ValueError: If the time strings cannot be parsed or if
                    start >= end (no valid window).

    Example:
        >>> generate_time_slots("09:00", "11:00")
        ['09:00', '09:30', '10:00', '10:30']
    """
    fmt = "%H:%M"

    try:
        start_dt = datetime.strptime(start_time_str, fmt)
        end_dt = datetime.strptime(end_time_str, fmt)
    except (ValueError, TypeError) as exc:
        raise ValueError(
            f"Invalid time format. Expected 'HH:MM', got "
            f"start='{start_time_str}', end='{end_time_str}'."
        ) from exc

    if start_dt >= end_dt:
        raise ValueError(
            f"shift_start ({start_time_str}) must be before "
            f"shift_end ({end_time_str})."
        )

    delta = timedelta(minutes=interval_minutes)
    slots: list[str] = []
    current = start_dt

    while current < end_dt:
        slots.append(current.strftime(fmt))
        current += delta

    return slots
