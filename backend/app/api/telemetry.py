import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..core.database import get_session
from ..models.telemetry import Meter, MeterCreate, MeterRead, MeterReading, MeterReadingCreate, MeterReadingRead

router = APIRouter()

# --- Meters ---
@router.post("/meters/", response_model=MeterRead)
def create_meter(meter: MeterCreate, session: Session = Depends(get_session)):
    db_meter = Meter.model_validate(meter)
    session.add(db_meter)
    session.commit()
    session.refresh(db_meter)
    return db_meter

@router.get("/meters/", response_model=List[MeterRead])
def read_meters(offset: int = 0, limit: int = 100, session: Session = Depends(get_session)):
    meters = session.exec(select(Meter).offset(offset).limit(limit)).all()
    return meters

@router.get("/meters/{meter_id}", response_model=MeterRead)
def read_meter(meter_id: uuid.UUID, session: Session = Depends(get_session)):
    meter = session.get(Meter, meter_id)
    if not meter:
        raise HTTPException(status_code=404, detail="Meter not found")
    return meter

# --- Readings ---
@router.post("/readings/", response_model=MeterReadingRead)
def create_reading(reading: MeterReadingCreate, session: Session = Depends(get_session)):
    # Verify meter exists
    meter = session.get(Meter, reading.meter_id)
    if not meter:
        raise HTTPException(status_code=404, detail="Meter not found")
        
    db_reading = MeterReading.model_validate(reading)
    session.add(db_reading)
    session.commit()
    session.refresh(db_reading)
    return db_reading

@router.get("/meters/{meter_id}/readings", response_model=List[MeterReadingRead])
def read_meter_readings(meter_id: uuid.UUID, session: Session = Depends(get_session)):
    # Basic check if meter exists
    meter = session.get(Meter, meter_id)
    if not meter:
        raise HTTPException(status_code=404, detail="Meter not found")
    
    # Return readings sorted by time desc
    readings = session.exec(select(MeterReading).where(MeterReading.meter_id == meter_id).order_by(MeterReading.time.desc())).all()
    return readings
