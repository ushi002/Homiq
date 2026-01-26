import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..core.database import get_session
from sqlmodel import Session, select
from ..core.database import get_session
from ..models.property import User, UserCreate, UserRead, UserUpdate, UserPasswordChange

router = APIRouter()

from ..core.security import get_password_hash, verify_password
from .deps import get_current_user

@router.post("/", response_model=UserRead)
def create_user(
    user: UserCreate, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    # RBAC
    if current_user.role == "admin":
        # Admin can create home_lord, owner, AND admin
        if user.role not in ["home_lord", "owner", "admin"]:
             raise HTTPException(status_code=403, detail="Invalid role")
    elif current_user.role == "home_lord":
        if user.role != "owner":
             raise HTTPException(status_code=403, detail="Home Lords can only create Owners")
    else:
        raise HTTPException(status_code=403, detail="Not authorized to create users")

    # Logic for invite vs password
    db_user = User.model_validate(user)
    db_user.created_by_id = current_user.id # Track creator
    
    if user.password:
        db_user.password_hash = get_password_hash(user.password)
        db_user.status = "active"
    else:
        # Generate invite
        import secrets
        from datetime import datetime, timedelta
        db_user.invite_token = secrets.token_urlsafe(32)
        db_user.invite_expires_at = datetime.utcnow() + timedelta(hours=48)
        db_user.status = "pending"

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

@router.patch("/me", response_model=UserRead)
def update_self(
    user_update: UserUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if user_update.full_name is not None:
        current_user.full_name = user_update.full_name
        
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user

@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: uuid.UUID,
    user_update: UserUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # RBAC Permissions
    if current_user.role == "admin":
        # Admin can edit Home Lords and Owners. 
        # (And potentially other Admins? Safe to allow all for now or restrict?)
        # User said: "Admin to change Home lord's full name and Owner's full name"
        pass 
    elif current_user.role == "home_lord":
        # Home Lord can change Owner's full name
        if user.role != "owner":
             raise HTTPException(status_code=403, detail="Home Lords can only edit Owners")
        if user.created_by_id != current_user.id:
             # Or check if owner belongs to a unit in managed building?
             # For now, consistent with Read/Delete: created_by_id
             raise HTTPException(status_code=403, detail="Not authorized to edit this user")
    else:
        # Owners cannot edit others
        if user.id != current_user.id:
             raise HTTPException(status_code=403, detail="Not authorized")

    if user_update.full_name is not None:
        user.full_name = user_update.full_name
        
    session.add(user)
    session.commit()
    session.refresh(user)
    return user

@router.post("/me/password")
def change_password(
    password_change: UserPasswordChange,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if not verify_password(password_change.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect old password")
        
    current_user.password_hash = get_password_hash(password_change.new_password)
    session.add(current_user)
    session.commit()
    return {"message": "Password updated successfully"}
