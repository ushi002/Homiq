import uuid
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

class MeterCreate(MeterBase):
    pass

class MeterRead(MeterBase):
    id: uuid.UUID
