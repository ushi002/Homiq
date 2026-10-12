"""
Who may see what. Every check denies unknown roles, so a new role has no access until it is
added here explicitly.
  admin      everything
  home_lord  buildings they manage (and their units and meters)
  owner      units they own, and buildings where they own a unit
"""
from fastapi import HTTPException
from sqlmodel import Session, select
from ..models.property import Building, Unit, User


def can_access_building(user: User, building: Building, session: Session) -> bool:
    if user.role == "admin":
        return True
    if user.role == "home_lord":
        return building.manager_id == user.id
    if user.role == "owner":
        return session.exec(
            select(Unit).where(Unit.building_id == building.id, Unit.owner_id == user.id)
        ).first() is not None
    return False


def can_access_unit(user: User, unit: Unit, session: Session) -> bool:
    if user.role == "admin":
        return True
    if user.role == "home_lord":
        building = session.get(Building, unit.building_id)
        return building is not None and building.manager_id == user.id
    if user.role == "owner":
        return unit.owner_id == user.id
    return False


def can_access_user(current: User, user: User) -> bool:
    """Admins see everyone, managers the users they created, everyone themselves."""
    if current.id == user.id or current.role == "admin":
        return True
    return current.role == "home_lord" and user.created_by_id == current.id


def require(allowed: bool):
    if not allowed:
        raise HTTPException(status_code=403, detail="Not authorized")
