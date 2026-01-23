import uuid
from datetime import datetime
from typing import Optional, List
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
    readings: List["MeterReading"] = Relationship(back_populates="meter")

class MeterCreate(MeterBase):
    pass

class MeterRead(MeterBase):
    id: uuid.UUID

# Meter Reading Model
class MeterReadingBase(SQLModel):
    value: float
    is_manual: bool = False
    time: datetime = Field(default_factory=datetime.utcnow)
    meter_id: uuid.UUID = Field(foreign_key="meters.id")

class MeterReading(MeterReadingBase, table=True):
    __tablename__ = "meter_readings"
    id: Optional[int] = Field(default=None, primary_key=True) # Integer ID for simplicity in SQLite, eventually time+id composite
    
    meter: Optional[Meter] = Relationship(back_populates="readings")

class MeterReadingCreate(MeterReadingBase):
    pass

class MeterReadingRead(MeterReadingBase):
    id: int
