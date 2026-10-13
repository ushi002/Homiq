from datetime import timedelta, datetime
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from ..core.database import get_session
from ..core.security import verify_password, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES, get_password_hash
from ..models.property import User
from ..schemas.auth import Token, InviteAcceptRequest
from .deps import get_current_user
from ..core import login_limit

router = APIRouter()

@router.post("/token", response_model=Token)
async def login_for_access_token(
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Annotated[Session, Depends(get_session)]
):
    # Behind Traefik the client's address is in X-Real-Ip (set by Traefik, not by the client)
    ip = request.headers.get("x-real-ip") or (request.client.host if request.client else "")
    if login_limit.is_locked(form_data.username, ip):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many login attempts")

    # Find user by email (username field in form_data)
    statement = select(User).where(User.email == form_data.username)
    user = session.exec(statement).first()

    if not user or not verify_password(form_data.password, user.password_hash):
        login_limit.record_failure(form_data.username, ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role}, expires_delta=access_token_expires
    )

    login_limit.record_success(form_data.username)

    # Update last login time
    user.last_login_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)

    return Token(access_token=access_token, token_type="bearer", role=user.role, user_id=str(user.id), full_name=user.full_name)

@router.post("/token/refresh", response_model=Token)
def refresh_access_token(current_user: Annotated[User, Depends(get_current_user)]):
    """A new token for a still valid one, so an active user is not logged out after 8 hours.
    A deleted user gets 401 (get_current_user reads the user from the database)."""
    access_token = create_access_token(
        data={"sub": str(current_user.id), "role": current_user.role},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return Token(access_token=access_token, token_type="bearer", role=current_user.role,
                 user_id=str(current_user.id), full_name=current_user.full_name)

@router.post("/accept-invite", response_model=Token)
def accept_invite(
    request: InviteAcceptRequest,
    session: Annotated[Session, Depends(get_session)]
):
    statement = select(User).where(User.invite_token == request.token)
    user = session.exec(statement).first()
    
    if not user:
        raise HTTPException(status_code=400, detail="Invalid invite token")
        
    if user.invite_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invite expired")
        
    user.password_hash = get_password_hash(request.password)
    user.status = "active"
    user.invite_token = None
    user.invite_expires_at = None
    
    session.add(user)
    session.commit()
    session.refresh(user)
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role}, expires_delta=access_token_expires
    )
    return Token(access_token=access_token, token_type="bearer", role=user.role, user_id=str(user.id), full_name=user.full_name)

@router.get("/validate-invite/{token}")
def validate_invite(
    token: str,
    session: Annotated[Session, Depends(get_session)]
):
    statement = select(User).where(User.invite_token == token)
    user = session.exec(statement).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="Invalid invite token")
        
    if user.invite_expires_at and user.invite_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invite expired")
        
    return {"status": "valid", "email": user.email}
