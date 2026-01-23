import uuid
from typing import Optional, List
from sqlmodel import Field, SQLModel, Relationship

# User Model
class UserBase(SQLModel):
    email: str = Field(index=True, unique=True)
    full_name: Optional[str] = None
    role: str = "owner"  # admin, owner, board_member

class User(UserBase, table=True):
    __tablename__ = "users"
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)

class UserCreate(UserBase):
    pass

class UserRead(UserBase):
    id: uuid.UUID

# Building Model
class BuildingBase(SQLModel):
    name: str
    address: str
    description: Optional[str] = None

class Building(BuildingBase, table=True):
    __tablename__ = "buildings"
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    
    units: List["Unit"] = Relationship(back_populates="building")

class BuildingCreate(BuildingBase):
    pass

class BuildingRead(BuildingBase):
    id: uuid.UUID

# Unit Model
class UnitBase(SQLModel):
    unit_number: str
    floor: int
    area_m2: float
    building_id: uuid.UUID = Field(foreign_key="buildings.id")

class Unit(UnitBase, table=True):
    __tablename__ = "units"
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    
    building: Optional[Building] = Relationship(back_populates="units")

class UnitCreate(UnitBase):
    pass

class UnitRead(UnitBase):
    id: uuid.UUID
