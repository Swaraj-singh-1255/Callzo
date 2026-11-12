from datetime import datetime, timezone
from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator


class CallEvent(BaseModel):
    event_id: str = Field(..., min_length=1, max_length=64)
    event_type: Literal["call.started", "call.ended", "call.failed"]
    account_id: str = Field(..., min_length=1, max_length=64)
    call_id: str = Field(..., min_length=1, max_length=64)
    timestamp: datetime
    duration_seconds: int = Field(ge=0, le=10_000_000, default=0)
    cost_cents: int = Field(ge=0, le=1_000_000_000, default=0)
    destination_country: Optional[str] = Field(None, max_length=8)

    @field_validator("event_id", "account_id", "call_id", "destination_country")
    @classmethod
    def no_nul(cls, v):
        if v is not None and "\x00" in v:
            raise ValueError("NUL character not allowed")
        return v

    @field_validator("timestamp", mode="before")
    @classmethod
    def parse_timestamp(cls, v):
        if isinstance(v, str):
            v = datetime.fromisoformat(v.replace("Z", "+00:00"))
        if isinstance(v, datetime) and v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)  # naive timestamps are treated as UTC
        return v


class UsageResponse(BaseModel):
    account_id: str
    month: str
    total_minutes: int
    total_cost_cents: int
    call_count: int
    over_cap: bool
    late_event_count: int = 0
    monthly_cap_cents: int
    remaining_cents: int


class HealthResponse(BaseModel):
    status: str
    service: str
    database: str