from typing import Optional
from pydantic import BaseModel

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    user_id: str

class TokenData(BaseModel):
    user_id: Optional[str] = None
    role: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str
