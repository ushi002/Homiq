import uuid
from typing import Optional, List
from sqlmodel import Field, SQLModel, Relationship
from datetime import datetime

# User Model
class UserBase(SQLModel):
    email: str = Field(index=True, unique=True)
    full_name: Optional[str] = None
    role: str = "home_lord" # admin, home_lord, owner
    invite_token: Optional[str] = None
    invite_expires_at: Optional[datetime] = None
    status: str = Field(default="active") # active, pending

class User(UserBase, table=True):
    __tablename__ = "users"
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    password_hash: str = Field(default="")
    
    units: List["Unit"] = Relationship(back_populates="owner")
    managed_buildings: List["Building"] = Relationship(back_populates="manager")

    created_by_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    created_by: Optional["User"] = Relationship(
        sa_relationship_kwargs={"remote_side": "User.id"},
        back_populates="created_users"
    )
    created_users: List["User"] = Relationship(back_populates="created_by")

class UserCreate(UserBase):
    password: Optional[str] = None

class UserUpdate(SQLModel):
    full_name: Optional[str] = None

class UserRead(UserBase):
    id: uuid.UUID

# Building Model
class BuildingBase(SQLModel):
    name: str
    address: str
    description: Optional[str] = None
    influx_db_name: Optional[str] = None
    influx_unit_tag: Optional[str] = None
    influx_measurements: Optional[str] = None
    units_fetched: bool = Field(default=False)

class Building(BuildingBase, table=True):
    __tablename__ = "buildings"
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    
    manager_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    manager: Optional[User] = Relationship(back_populates="managed_buildings")

    units: List["Unit"] = Relationship(back_populates="building")

class BuildingCreate(BuildingBase):
    pass

class BuildingUpdate(SQLModel):
    name: Optional[str] = None
    address: Optional[str] = None
    description: Optional[str] = None
    influx_db_name: Optional[str] = None
    influx_unit_tag: Optional[str] = None
    influx_measurements: Optional[str] = None
    units_fetched: Optional[bool] = None

class BuildingRead(BuildingBase):
    id: uuid.UUID
    manager_id: Optional[uuid.UUID] = None

# Unit Model
class UnitBase(SQLModel):
    unit_number: str
    floor: int
    area_m2: float
    building_id: uuid.UUID = Field(foreign_key="buildings.id")
    owner_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")

class Unit(UnitBase, table=True):
    __tablename__ = "units"
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    
    building: Optional[Building] = Relationship(back_populates="units")
    owner: Optional[User] = Relationship(back_populates="units")

class UnitCreate(UnitBase):
    pass

class UnitRead(UnitBase):
    id: uuid.UUID
    owner: Optional[UserRead] = None
