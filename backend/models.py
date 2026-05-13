"""All Pydantic request models."""
from typing import List, Optional
from pydantic import BaseModel, Field, EmailStr


# ----- legacy auth -----
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    first_name: str
    age: int = Field(ge=18, le=99)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


# ----- profile -----
class ProfileIn(BaseModel):
    first_name: Optional[str] = None
    age: Optional[int] = Field(default=None, ge=18, le=99)
    gender: Optional[str] = None
    interested_in: Optional[str] = None
    bio: Optional[str] = None
    interests: Optional[List[str]] = None
    photos: Optional[List[str]] = None
    horoscope: Optional[str] = None
    hide_age: Optional[bool] = None
    birthday: Optional[str] = None


# ----- checkin -----
class CheckinIn(BaseModel):
    venue_id: str
    lat: float
    lng: float
    selfie_base64: str


# ----- social -----
class LikeIn(BaseModel):
    target_user_id: str
    action: str  # like, hi, pass


class MessageIn(BaseModel):
    match_id: str
    text: str


class KeepIn(BaseModel):
    match_id: str


# ----- safety -----
class ReportIn(BaseModel):
    target_user_id: str
    reason: str
    details: Optional[str] = None


# ----- unified auth -----
class IdentifierIn(BaseModel):
    identifier: str


class UnifiedLoginIn(BaseModel):
    identifier: str
    password: Optional[str] = None
    code: Optional[str] = None


class UnifiedSignupIn(BaseModel):
    identifier: str
    code: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    first_name: str
    age: int = Field(ge=18, le=99)


class EmailOtpSendIn(BaseModel):
    email: EmailStr
    purpose: str = "signup"


class EmailOtpVerifyIn(BaseModel):
    email: EmailStr
    code: str
    purpose: str = "signup"


class ResetRequestIn(BaseModel):
    identifier: str


class ResetConfirmIn(BaseModel):
    token: Optional[str] = None
    identifier: Optional[str] = None
    code: Optional[str] = None
    new_password: str = Field(min_length=6)


class UsernameCheckIn(BaseModel):
    username: str


# ----- account verify -----
class AccountEmailIn(BaseModel):
    email: Optional[EmailStr] = None


class AccountEmailConfirmIn(BaseModel):
    code: str
    email: Optional[EmailStr] = None


class AccountPhoneIn(BaseModel):
    phone: Optional[str] = None


class AccountPhoneConfirmIn(BaseModel):
    code: str
    phone: Optional[str] = None


# ----- push -----
class PushRegisterIn(BaseModel):
    token: str
    platform: Optional[str] = None
    device_name: Optional[str] = None


# ----- phone otp legacy -----
class PhoneSendIn(BaseModel):
    phone: str


class PhoneVerifyIn(BaseModel):
    phone: str
    code: str
    first_name: Optional[str] = "Friend"
    age: Optional[int] = 21


# ----- google -----
class GoogleSessionIn(BaseModel):
    session_id: str


# ----- firebase phone -----
class FirebaseExchangeIn(BaseModel):
    id_token: str
    first_name: Optional[str] = None
    age: Optional[int] = None
    username: Optional[str] = None
