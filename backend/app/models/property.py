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
    last_login_at: Optional[datetime] = None
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
    
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserCreate(UserBase):
    password: Optional[str] = None

class UserUpdate(SQLModel):
    full_name: Optional[str] = None

class UserPasswordChange(SQLModel):
    old_password: str
    new_password: str

class UserRead(UserBase):
    id: uuid.UUID
    created_at: datetime

class UserPublic(SQLModel):
    """A user as shown inside other objects (unit owner): no invite token or login data."""
    id: uuid.UUID
    email: str
    full_name: Optional[str] = None
    role: str

# Building Model
class BuildingBase(SQLModel):
    name: str
    address: str
    description: Optional[str] = None
    influx_db_name: Optional[str] = None
    influx_unit_tag: Optional[str] = None
    influx_device_tag: Optional[str] = None
    influx_measurements: Optional[str] = None
    units_fetched: bool = Field(default=False)
    # Location for the outdoor temperature in the energy overview (Open-Meteo)
    latitude: Optional[float] = None
    longitude: Optional[float] = None

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
    influx_device_tag: Optional[str] = None
    influx_measurements: Optional[str] = None
    units_fetched: Optional[bool] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

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
    # From the building's heat loss calculation (scripts/import_heat_losses.py), for the energy
    # overview: design heat loss [W], heated area used for billing [m2] (area x coefficients of
    # use and room height) and the coefficient of the unit's position (billing correction)
    heat_loss_w: Optional[float] = None
    heated_area_m2: Optional[float] = None
    position_coef: Optional[float] = None

class Unit(UnitBase, table=True):
    __tablename__ = "units"
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    
    building: Optional[Building] = Relationship(back_populates="units")
    owner: Optional[User] = Relationship(back_populates="units")

class UnitRead(UnitBase):
    id: uuid.UUID
    owner: Optional[UserPublic] = None


class BuildingEnergyYear(SQLModel, table=True):
    """A building's yearly energy bill (calendar year) from the heating cost allocation: heat for
    heating and for hot water from the building's boiler room, water billed by the supplier and
    measured on the flats' meters (scripts/import_energy_years.py). corrected_*_gj = the heat when
    the bill's figures are evidently wrong (used instead of them, the bill's are kept), unreliable
    = shown but left out of comparisons, note = remarks on the source."""
    __tablename__ = "building_energy_years"
    building_id: uuid.UUID = Field(foreign_key="buildings.id", primary_key=True)
    year: int = Field(primary_key=True)
    heating_gj: Optional[float] = None
    heating_cost: Optional[float] = None
    heating_price: Optional[float] = None  # CZK/GJ as billed
    base_share_pct: Optional[float] = None  # share of heating costs split by area
    heating_units: Optional[float] = None  # sum of the heat meters' readings x coefficients
    hot_water_gj: Optional[float] = None
    hot_water_cost: Optional[float] = None
    hot_water_price: Optional[float] = None
    cold_water_billed_m3: Optional[float] = None
    cold_water_metered_m3: Optional[float] = None
    hot_water_billed_m3: Optional[float] = None
    hot_water_metered_m3: Optional[float] = None
    water_price: Optional[float] = None
    heated_area_m2: Optional[float] = None
    hot_water_area_m2: Optional[float] = None
    persons: Optional[float] = None
    degree_days_billing: Optional[float] = None
    corrected_heating_gj: Optional[float] = None
    corrected_hot_water_gj: Optional[float] = None
    unreliable: bool = Field(default=False)
    note: Optional[str] = None
