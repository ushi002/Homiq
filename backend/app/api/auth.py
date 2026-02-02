from datetime import timedelta, datetime
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from ..core.database import get_session
from ..core.security import verify_password, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES, get_password_hash
from ..models.property import User
from ..schemas.auth import Token, InviteAcceptRequest

router = APIRouter()

@router.post("/token", response_model=Token)
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Annotated[Session, Depends(get_session)]
):
    # Find user by email (username field in form_data)
    statement = select(User).where(User.email == form_data.username)
    user = session.exec(statement).first()
    

    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role}, expires_delta=access_token_expires
    )
    return Token(access_token=access_token, token_type="bearer", role=user.role, user_id=str(user.id), full_name=user.full_name)

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
