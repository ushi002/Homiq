import uuid
from datetime import date
from typing import Optional
from sqlmodel import Field, SQLModel, Relationship
from .property import Unit

# Meter Model
class MeterBase(SQLModel):
    serial_number: str = Field(index=True, unique=True)
    type: str  # water_cold, water_hot, heat, electricity
    unit_of_measure: str # m3, kWh
    unit_id: uuid.UUID = Field(foreign_key="units.id")

class Meter(MeterBase, table=True):
    __tablename__ = "meters"
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    
    # Relationships
    unit: Optional[Unit] = Relationship()

class MeterRead(MeterBase):
    id: uuid.UUID


class DailyTemperature(SQLModel, table=True):
    """Daily mean outdoor temperature at a place (Open-Meteo archive), kept so each day is fetched
    once. Place = coordinates rounded to 2 decimals (about 1 km)."""
    __tablename__ = "daily_temperatures"
    latitude: float = Field(primary_key=True)
    longitude: float = Field(primary_key=True)
    day: date = Field(primary_key=True)
    mean_c: float
