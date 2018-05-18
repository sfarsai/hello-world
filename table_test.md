
Customer | SI | Device | Protocol | Platform | Git ID/Repo | Issues Encountered | Status
-- | -- | -- | -- | -- | -- | -- | --
FedEx | Turnkey | 4971D | Marimba     MATP | FlowDesigner | #331, #2 | Initial docs were for 4970 (i.e., different   protocol than 4971).          Support for ACK. | ACK support being revisited.
TraceIT |   | 6360     (OBDII) | binary | FlowDesigner | #316, #335 |   | Needs unit tests, review   of docs, and completion of #335.
Cartasite | MachineCDN | 2460     (OBDII) | binary | FlowDesigner     (MachineCDN) | #335, #1 | Field 0x6c          Lat/Lon | Tested by MCDN.              Deployed to prod.          Includes conversion of raw OBD to DTC within the node itself.
CarForce |   | 2460     (OBDII) | binary | FlowDesigner     DataFlow | #341     #827 ("core" repo) | Same PCR as   Cartasite.     New PID provider to come later.     Request was for DataFlow not FlowDesigner. | Devices and endpoint from   CarForce ready.          Project created in CarForce org.          Node not generating endpoint in DataFlow.    Reported as critical bug in core repo.
  | Springshot | 4975 | ?? | FlowDesigner | #337, #3 | Goal:  Change   config via UDP (vs. SMS) based on geofencing.          Add 2-3 sec pause in between messages. | Eran provided project.  Malik/Suman to test via Smriti's device.

