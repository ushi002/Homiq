import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..core.database import get_session
from ..models.property import User, UserCreate, UserRead

router = APIRouter()

@router.post("/", response_model=UserRead)
def create_user(user: UserCreate, session: Session = Depends(get_session)):
    db_user = User.model_validate(user)
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user

@router.get("/", response_model=List[UserRead])
def read_users(offset: int = 0, limit: int = 100, session: Session = Depends(get_session)):
    users = session.exec(select(User).offset(offset).limit(limit)).all()
    return users

@router.get("/{user_id}", response_model=UserRead)
def read_user(user_id: uuid.UUID, session: Session = Depends(get_session)):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
