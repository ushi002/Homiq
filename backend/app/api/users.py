import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..core.database import get_session
from ..models.property import User, UserCreate, UserRead

router = APIRouter()

from ..core.security import get_password_hash
from .deps import get_current_user

@router.post("/", response_model=UserRead)
def create_user(
    user: UserCreate, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    # RBAC
    if current_user.role == "admin":
        if user.role != "home_lord":
             raise HTTPException(status_code=403, detail="Admins can only create Home Lords")
    elif current_user.role == "home_lord":
        if user.role != "owner":
             raise HTTPException(status_code=403, detail="Home Lords can only create Owners")
    else:
        raise HTTPException(status_code=403, detail="Not authorized to create users")

    # Hash password
    db_user = User.model_validate(user)
    db_user.password_hash = get_password_hash(user.password)
    db_user.created_by_id = current_user.id # Track creator
    
    # Check if email exists
    if session.exec(select(User).where(User.email == user.email)).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user

@router.get("/", response_model=List[UserRead])
def read_users(
    offset: int = 0, 
    limit: int = 100, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    statement = select(User)
    if current_user.role == "home_lord":
        # Only see users created by them (Owners)
        statement = statement.where(User.created_by_id == current_user.id)
    elif current_user.role == "owner":
         # Owners shouldn't see anyone really, maybe themselves?
         statement = statement.where(User.id == current_user.id)
    # Admin sees all
    
    users = session.exec(statement.offset(offset).limit(limit)).all()
    return users

@router.get("/{user_id}", response_model=UserRead)
def read_user(user_id: uuid.UUID, session: Session = Depends(get_session)):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.delete("/{user_id}")
def delete_user(
    user_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Check permissions: Can only delete users created by themselves
    if user.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this user")
        
    session.delete(user)
    session.commit()
    return {"ok": True}
