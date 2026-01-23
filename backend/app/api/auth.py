from datetime import timedelta
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from ..core.database import get_session
from ..core.security import verify_password, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
from ..models.property import User
from ..schemas.auth import Token

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
    return Token(access_token=access_token, token_type="bearer", role=user.role, user_id=str(user.id))
