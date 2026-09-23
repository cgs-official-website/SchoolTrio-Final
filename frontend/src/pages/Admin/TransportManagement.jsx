import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  listVehicles, 
  createVehicle, 
  updateVehicle, 
  deleteVehicle,
  listRoutes,
  createRoute,
  updateRoute,
  deleteRoute,
  listTransportAssignments,
  assignStudentToRoute,
  unassignStudentFromRoute
} from '../../api/transport';
import { listStudents } from '../../api/students';
import { 
  LuBus as Bus, 
  LuPlus as Plus, 
  LuX as X, 
  LuUsers as Users, 
  LuPhone as Phone, 
  LuNavigation as Navigation, 
  LuTriangleAlert as AlertTriangle, 
  LuCircleCheck as CheckCircle2,
  LuCalendar as Calendar,
  LuSearch as Search,
  LuFilter as Filter,
  LuShieldAlert as ShieldAlert
} from 'react-icons/lu';
import { Edit, Trash2, Eye } from 'lucide-react';
import ConfirmModal from '../../components/ConfirmModal';
import toast from 'react-hot-toast';
import CustomFieldsRenderer from '../../components/CustomFieldsRenderer';
import usePermissions from '../../hooks/usePermissions';
import { validateVehicleRegistrationNumber } from '../../utils/validationUtils';

export default function TransportManagement() {
  const { userProfile } = useAuth();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const hasCreatePermission = userProfile?.role?.toLowerCase() === 'admin' || userProfile?.role?.toLowerCase() === 'superadmin' || canCreate('transport');
  const hasEditPermission = userProfile?.role?.toLowerCase() === 'admin' || userProfile?.role?.toLowerCase() === 'superadmin' || canEdit('transport');
  const hasDeletePermission = userProfile?.role?.toLowerCase() === 'admin' || userProfile?.role?.toLowerCase() === 'superadmin' || canDelete('transport');

  const [activeTab, setActiveTab] = useState('routes'); // 'routes' | 'vehicles' | 'assignments'

  const [routes, setRoutes] = useState([]);
  const [students, setStudents] = useState([]); // All students to populate assign list
  const [loading, setLoading] = useState(true);

  // Vehicles state
  const [vehicles, setVehicles] = useState([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState('');
  const [vehicleStatusFilter, setVehicleStatusFilter] = useState('all'); // 'all' | 'Active' | 'Inactive'
  const [vehicleComplianceFilter, setVehicleComplianceFilter] = useState('all'); // 'all' | 'expiring' | 'expired'
  
  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [activeRouteId, setActiveRouteId] = useState(null); // For assignment
  const [selectedRouteToView, setSelectedRouteToView] = useState(null);
  const [confirmDeleteState, setConfirmDeleteState] = useState({ isOpen: false, id: null, name: '' });

  // Vehicle Modals state
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showViewVehicleModal, setShowViewVehicleModal] = useState(false);
  const [selectedVehicleToView, setSelectedVehicleToView] = useState(null);
  const [vehicleConfirmDeleteState, setVehicleConfirmDeleteState] = useState({ isOpen: false, id: null, name: '' });

  // Forms state
  const [creating, setCreating] = useState(false);
  const [newRoute, setNewRoute] = useState({
    name: '',
    vehicleNumber: '',
    vehicleId: '',
    driverName: '',
    driverPhone: '',
    capacity: '',
    customData: {}
  });
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Vehicle Form State
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [vehicleErrors, setVehicleErrors] = useState({});
  const [newVehicle, setNewVehicle] = useState({
    vehicleName: '',
    vehicleModel: '',
    registrationNumber: '',
    seatingCapacity: '',
    assignedRouteIds: [],
    fcExpiryDate: '',
    insuranceExpiryDate: '',
    permitExpiryDate: '',
    roadTaxExpiryDate: '',
    pollutionCertificateExpiryDate: '',
    status: 'Active'
  });

  // Student assignments tab search
  const [assignmentSearchQuery, setAssignmentSearchQuery] = useState('');

  // Helpers to map REST payloads to component state
  const mapVehicleFromRest = useCallback((v) => ({
    id: v.id,
    vehicleName: v.customData?.vehicleName || v.model || v.registrationNumber,
    vehicleModel: v.model || v.customData?.vehicleModel || '',
    registrationNumber: v.registrationNumber,
    seatingCapacity: v.capacity,
    fcExpiryDate: v.fitnessExpiry || v.customData?.fcExpiryDate || '',
    insuranceExpiryDate: v.insuranceExpiry || v.customData?.insuranceExpiryDate || '',
    pollutionCertificateExpiryDate: v.pollutionExpiry || v.customData?.pollutionCertificateExpiryDate || '',
    permitExpiryDate: v.customData?.permitExpiryDate || '',
    roadTaxExpiryDate: v.customData?.roadTaxExpiryDate || '',
    assignedRouteIds: v.routes ? v.routes.map(r => r.id) : (v.customData?.assignedRouteIds || []),
    status: v.status || 'Active',
    customData: v.customData || {}
  }), []);

  const mapRouteFromRest = useCallback((r) => ({
    id: r.id,
    name: r.name,
    routeNumber: r.routeNumber || '',
    vehicleNumber: r.vehicle?.registrationNumber || r.routeNumber || 'N/A',
    vehicleId: r.vehicleId || null,
    driverName: r.driverName || '',
    driverPhone: r.driverPhone || '',
    capacity: r.capacity || 30,
    assignedStudents: r.students ? r.students.map(s => s.id) : [],
    stops: r.stops || [],
    customData: r.customData || {}
  }), []);

  const loadAllTransportData = useCallback(async () => {
    setLoading(true);
    setLoadingVehicles(true);
    try {
      const [routesRes, vehiclesRes, studentsRes, assignmentsRes] = await Promise.all([
        listRoutes(),
        listVehicles(),
        listStudents({ limit: 100 }).catch(() => ({ data: [] })),
        listTransportAssignments().catch(() => ({ data: [] }))
      ]);

      const rawRoutes = Array.isArray(routesRes?.data) ? routesRes.data : [];
      const rawVehicles = Array.isArray(vehiclesRes?.data) ? vehiclesRes.data : [];
      const rawStudents = Array.isArray(studentsRes?.data) ? studentsRes.data : [];
      const rawAssignments = Array.isArray(assignmentsRes?.data) ? assignmentsRes.data : [];

      const mappedVehicles = rawVehicles.map(mapVehicleFromRest);
      const mappedRoutes = rawRoutes.map(mapRouteFromRest);

      // Build map of assignments by student ID
      const assignmentMap = new Map();
      const routeStudentMap = new Map();

      rawAssignments.forEach(a => {
        assignmentMap.set(a.id, a);
        if (a.transportRouteId) {
          if (!routeStudentMap.has(a.transportRouteId)) {
            routeStudentMap.set(a.transportRouteId, []);
          }
          routeStudentMap.get(a.transportRouteId).push(a.id);
        }
      });

      const enrichedStudents = rawStudents.map(s => {
        const assignment = assignmentMap.get(s.id);
        return {
          ...s,
          transportRouteId: assignment?.transportRouteId || s.transportRouteId || null,
          pickupStopId: assignment?.pickupStopId || s.pickupStopId || null
        };
      });

      const routesWithStudents = mappedRoutes.map(r => ({
        ...r,
        assignedStudents: routeStudentMap.get(r.id) || r.assignedStudents || []
      }));

      setVehicles(mappedVehicles);
      setRoutes(routesWithStudents);
      setStudents(enrichedStudents);
    } catch (err) {
      console.error('Error loading transport data:', err);
      toast.error('Failed to load transport data.');
    } finally {
      setLoading(false);
      setLoadingVehicles(false);
    }
  }, [mapVehicleFromRest, mapRouteFromRest]);

  useEffect(() => {
    loadAllTransportData();
  }, [loadAllTransportData]);

  // Route Handlers
  const handleCreateRoute = async (e) => {
    e.preventDefault();
    if (newRoute.id && !hasEditPermission) {
      toast.error("You do not have permission to edit transport routes.");
      return;
    }
    if (!newRoute.id && !hasCreatePermission) {
      toast.error("You do not have permission to create transport routes.");
      return;
    }
    if (!newRoute.name || !newRoute.capacity) return;

    let cleanPhone = null;
    if (newRoute.driverPhone) {
      cleanPhone = newRoute.driverPhone.replace(/[\s()-]/g, '');
      const phoneRegex = /^(?:\+?91|0)?[1-9]\d{9}$/;
      if (!phoneRegex.test(cleanPhone)) {
        toast.error("Please enter a valid 10-digit driver phone number.");
        return;
      }
    }

    setCreating(true);

    try {
      const routePayload = {
        name: newRoute.name,
        routeNumber: newRoute.routeNumber || newRoute.vehicleNumber || null,
        vehicleId: newRoute.vehicleId || null,
        driverName: newRoute.driverName || null,
        driverPhone: cleanPhone || null,
        capacity: Number(newRoute.capacity)
      };

      if (newRoute.id) {
        await updateRoute(newRoute.id, routePayload);
        toast.success("Route updated successfully!");
      } else {
        await createRoute(routePayload);
        toast.success("Route created successfully!");
      }
      
      setShowCreateModal(false);
      setNewRoute({ name: '', vehicleNumber: '', vehicleId: '', driverName: '', driverPhone: '', capacity: '', customData: {} });
      await loadAllTransportData();
    } catch (error) {
      console.error("Error saving route:", error);
      toast.error(error.message || "Failed to save route.");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRoute = async () => {
    if (!hasDeletePermission) {
      toast.error("You do not have permission to delete transport routes.");
      return;
    }
    if (!confirmDeleteState.id) return;
    try {
      await deleteRoute(confirmDeleteState.id);
      toast.success("Route deleted successfully");
      setConfirmDeleteState({ isOpen: false, id: null, name: '' });
      await loadAllTransportData();
    } catch (error) {
      console.error("Error deleting route:", error);
      toast.error(error.message || "Failed to delete route");
    }
  };

  const handleAssignStudent = async (e) => {
    e.preventDefault();
    if (!hasEditPermission) {
      toast.error("You do not have permission to modify student assignments.");
      return;
    }
    if (!activeRouteId || !selectedStudentId) return;
    
    // Check client route capacity for immediate UX feedback
    const route = routes.find(r => r.id === activeRouteId);
    if (!route) return;
    
    if (route.assignedStudents?.length >= route.capacity) {
      toast.error("Cannot assign student. This bus has reached its maximum capacity!");
      return;
    }

    setAssigning(true);
    try {
      await assignStudentToRoute(activeRouteId, { studentId: selectedStudentId });
      setShowAssignModal(false);
      setSelectedStudentId('');
      toast.success("Student assigned successfully!");
      await loadAllTransportData();
    } catch (error) {
      console.error("Error assigning student:", error);
      toast.error(error.message || "Failed to assign student.");
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassignStudent = async (routeId, studentId) => {
    if (!hasEditPermission) {
      toast.error("You do not have permission to modify student assignments.");
      return;
    }
    if (!routeId || !studentId) return;
    try {
      await unassignStudentFromRoute(routeId, { studentId });
      
      if (selectedRouteToView) {
        setSelectedRouteToView(prev => ({
          ...prev,
          assignedStudents: prev.assignedStudents?.filter(id => id !== studentId) || []
        }));
      }
      
      toast.success("Student unassigned successfully");
      await loadAllTransportData();
    } catch (error) {
      console.error("Error unassigning student:", error);
      toast.error(error.message || "Failed to unassign student");
    }
  };

  const openAssignModal = (routeId) => {
    if (!hasEditPermission) {
      toast.error("You do not have permission to modify student assignments.");
      return;
    }
    setActiveRouteId(routeId);
    setShowAssignModal(true);
  };

  // Helper to get unassigned students for dropdown
  const unassignedStudents = students.filter(s => !s.transportRouteId);

  // Helper to format route display name
  const getRouteName = (routeId) => {
    const route = routes.find(r => r.id === routeId);
    return route ? route.name : 'Unknown Route';
  };

  // Compliance date calculation helpers
  const getExpiryStatus = (dateStr) => {
    if (!dateStr) return 'active';
    const expiry = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (expiry < today) return 'expired';
    
    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays <= 30) return 'expiring';
    return 'active';
  };

  const getVehicleComplianceStatus = (vehicle) => {
    const dates = [
      vehicle.fcExpiryDate,
      vehicle.insuranceExpiryDate,
      vehicle.permitExpiryDate,
      vehicle.roadTaxExpiryDate,
      vehicle.pollutionCertificateExpiryDate
    ];
    let hasExpired = false;
    let hasExpiring = false;
    for (const d of dates) {
      const status = getExpiryStatus(d);
      if (status === 'expired') hasExpired = true;
      if (status === 'expiring') hasExpiring = true;
    }
    if (hasExpired) return 'expired';
    if (hasExpiring) return 'expiring';
    return 'active';
  };

  // Vehicle KPIs
  const totalVehiclesCount = vehicles.length;
  const activeVehiclesCount = vehicles.filter(v => v.status === 'Active').length;
  const assignedVehiclesCount = vehicles.filter(v => v.assignedRouteIds && v.assignedRouteIds.length > 0).length;
  const unassignedVehiclesCount = vehicles.filter(v => !v.assignedRouteIds || v.assignedRouteIds.length === 0).length;
  const expiringVehiclesCount = vehicles.filter(v => getVehicleComplianceStatus(v) === 'expiring').length;
  const expiredVehiclesCount = vehicles.filter(v => getVehicleComplianceStatus(v) === 'expired').length;

  // Filtered vehicles
  const filteredVehicles = vehicles.filter(v => {
    const q = vehicleSearchQuery.trim().toLowerCase();
    const matchesSearch = 
      (v.vehicleName || '').toLowerCase().includes(q) ||
      (v.vehicleModel || '').toLowerCase().includes(q) ||
      (v.registrationNumber || '').toLowerCase().includes(q);

    const matchesStatus = vehicleStatusFilter === 'all' || v.status === vehicleStatusFilter;
    
    const complianceStatus = getVehicleComplianceStatus(v);
    const matchesCompliance = 
      vehicleComplianceFilter === 'all' || 
      complianceStatus === vehicleComplianceFilter;

    return matchesSearch && matchesStatus && matchesCompliance;
  });

  // Handle Save Vehicle
  const handleSaveVehicle = async (e) => {
    e.preventDefault();
    if (newVehicle.id && !hasEditPermission) {
      toast.error("You do not have permission to edit vehicles.");
      return;
    }
    if (!newVehicle.id && !hasCreatePermission) {
      toast.error("You do not have permission to register vehicles.");
      return;
    }

    // Vehicle Registration Number format validation
    const regError = validateVehicleRegistrationNumber(newVehicle.registrationNumber, true);
    if (regError) {
      setVehicleErrors(prev => ({ ...prev, registrationNumber: regError }));
      toast.error(regError);
      return;
    }

    // Capacity validation
    const parsedCapacity = parseInt(newVehicle.seatingCapacity, 10);
    if (isNaN(parsedCapacity) || parsedCapacity <= 0) {
      toast.error("Seating Capacity must be a positive integer.");
      return;
    }

    // Reg No uniqueness check
    const regNo = (newVehicle.registrationNumber || '').trim().toUpperCase();
    const isDuplicate = vehicles.some(
      v => v.id !== newVehicle.id && (v.registrationNumber || '').trim().toUpperCase() === regNo
    );
    if (isDuplicate) {
      const dupError = `Vehicle Registration Number "${regNo}" already exists in the system.`;
      setVehicleErrors(prev => ({ ...prev, registrationNumber: dupError }));
      toast.error(dupError);
      return;
    }

    setSavingVehicle(true);
    try {
      const payload = {
        registrationNumber: regNo,
        model: newVehicle.vehicleModel || newVehicle.model || null,
        capacity: parsedCapacity,
        fitnessExpiry: newVehicle.fcExpiryDate || null,
        insuranceExpiry: newVehicle.insuranceExpiryDate || null,
        pollutionExpiry: newVehicle.pollutionCertificateExpiryDate || null,
        status: newVehicle.status || 'Active',
        customData: {
          ...(newVehicle.customData || {}),
          vehicleName: newVehicle.vehicleName || null,
          permitExpiryDate: newVehicle.permitExpiryDate || null,
          roadTaxExpiryDate: newVehicle.roadTaxExpiryDate || null,
          assignedRouteIds: newVehicle.assignedRouteIds || []
        }
      };

      if (newVehicle.id) {
        await updateVehicle(newVehicle.id, payload);
        toast.success("Vehicle updated successfully!");
      } else {
        await createVehicle(payload);
        toast.success("Vehicle registered successfully!");
      }
      setVehicleErrors({});
      setShowVehicleModal(false);
      await loadAllTransportData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to save vehicle details.");
    } finally {
      setSavingVehicle(false);
    }
  };

  // Handle Delete Vehicle
  const handleDeleteVehicle = async () => {
    if (!hasDeletePermission) {
      toast.error("You do not have permission to delete vehicles.");
      return;
    }
    if (!vehicleConfirmDeleteState.id) return;
    try {
      await deleteVehicle(vehicleConfirmDeleteState.id);
      toast.success("Vehicle deleted successfully");
      setVehicleConfirmDeleteState({ isOpen: false, id: null, name: '' });
      await loadAllTransportData();
    } catch (error) {
      console.error("Error deleting vehicle:", error);
      toast.error(error.message || "Failed to delete vehicle");
    }
  };

  // Student list search
  const filteredStudents = students.filter(s => {
    const q = assignmentSearchQuery.trim().toLowerCase();
    const name = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase();
    const admNo = (s.admissionNumber || '').toLowerCase();
    const route = getRouteName(s.transportRouteId).toLowerCase();
    return name.includes(q) || admNo.includes(q) || route.includes(q);
  });

  if (loading || loadingVehicles) {
    return (
      <div className="flex justify-center items-center h-[80vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto min-w-0 pb-24">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 w-full">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white truncate">Transport Management</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage bus routes, drivers, school vehicles, and student assignments.</p>
        </div>
        
        {/* Actions based on active tab */}
        {hasCreatePermission && (
          <div className="w-full sm:w-auto">
            {activeTab === 'routes' && (
              <button 
                onClick={() => {
                  setNewRoute({ name: '', vehicleNumber: '', vehicleId: '', driverName: '', driverPhone: '', capacity: '', customData: {} });
                  setShowCreateModal(true);
                }}
                className="w-full sm:w-auto px-4 py-2.5 bg-primary-600 text-white rounded-xl font-semibold shadow-sm flex items-center justify-center gap-2 hover:bg-primary-700 transition-colors"
              >
                <Plus size={18} /> Add New Route
              </button>
            )}
            {activeTab === 'vehicles' && (
              <button 
                onClick={() => {
                  setNewVehicle({
                    vehicleName: '',
                    vehicleModel: '',
                    registrationNumber: '',
                    seatingCapacity: '',
                    assignedRouteIds: [],
                    fcExpiryDate: '',
                    insuranceExpiryDate: '',
                    permitExpiryDate: '',
                    roadTaxExpiryDate: '',
                    pollutionCertificateExpiryDate: '',
                    status: 'Active'
                  });
                  setVehicleErrors({});
                  setShowVehicleModal(true);
                }}
                className="w-full sm:w-auto px-4 py-2.5 bg-primary-600 text-white rounded-xl font-semibold shadow-sm flex items-center justify-center gap-2 hover:bg-primary-700 transition-colors"
              >
                <Plus size={18} /> Register Vehicle
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 mb-6 border-b border-slate-200 dark:border-slate-700 pb-3 overflow-x-auto w-full custom-scrollbar">
        <button
          onClick={() => setActiveTab('routes')}
          className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${
            activeTab === 'routes'
              ? 'bg-primary-600 text-white shadow-md shadow-primary-500/20'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <Navigation size={18} />
          <span>Transport Routes</span>
        </button>

        <button
          onClick={() => setActiveTab('vehicles')}
          className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${
            activeTab === 'vehicles'
              ? 'bg-primary-600 text-white shadow-md shadow-primary-500/20'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <Bus size={18} />
          <span>Vehicle Management</span>
        </button>

        <button
          onClick={() => setActiveTab('assignments')}
          className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${
            activeTab === 'assignments'
              ? 'bg-primary-600 text-white shadow-md shadow-primary-500/20'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <Users size={18} />
          <span>Student Assignments</span>
        </button>
      </div>

      {/* -------------------- TAB 1: ROUTES -------------------- */}
      {activeTab === 'routes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {routes.length === 0 ? (
            <div className="col-span-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 p-12 text-center text-slate-500 dark:text-slate-400">
              <Bus size={64} className="mx-auto mb-4 text-slate-300" />
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No Routes Found</h3>
              <p>Create your first transport route to begin assigning students.</p>
            </div>
          ) : (
            routes.map(route => {
              const currentCount = route.assignedStudents?.length || 0;
              const isFull = currentCount >= route.capacity;
              const percentage = Math.round((currentCount / route.capacity) * 100) || 0;

              return (
                <div key={route.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                  <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-bold text-lg text-slate-900 dark:text-white leading-tight pr-4 truncate">{route.name}</h3>
                      <div className="flex items-center gap-1 shrink-0">
                        <button 
                          onClick={() => { setSelectedRouteToView(route); setShowViewModal(true); }}
                          className="p-1.5 text-slate-400 dark:text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <Eye size={18} />
                        </button>
                        {hasEditPermission && (
                          <button 
                            onClick={() => { setNewRoute(route); setShowCreateModal(true); }}
                            className="p-1.5 text-slate-400 dark:text-slate-300 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            title="Edit Route"
                          >
                            <Edit size={18} />
                          </button>
                        )}
                        {hasDeletePermission && (
                          <button 
                            onClick={() => setConfirmDeleteState({ isOpen: true, id: route.id, name: route.name })}
                            className="p-1.5 text-slate-400 dark:text-slate-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            title="Delete Route"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-200/50 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-mono font-bold tracking-wide">
                      {route.vehicleNumber}
                    </div>
                  </div>

                  <div className="p-6 flex-1 space-y-4">
                    <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                        <Users size={16} className="text-slate-500 dark:text-slate-400" />
                      </div>
                      <div className="overflow-hidden">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">{route.driverName || 'No Driver Assigned'}</p>
                        <p className="text-xs truncate flex items-center gap-1"><Phone size={10}/> {route.driverPhone || 'N/A'}</p>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-end mb-2">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Capacity</span>
                        <span className={`font-bold text-sm ${isFull ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>
                          {currentCount} / {route.capacity}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${isFull ? 'bg-red-500' : percentage > 80 ? 'bg-amber-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  {hasEditPermission && (
                    <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 mt-auto">
                      <button 
                        onClick={() => openAssignModal(route.id)}
                        disabled={isFull}
                        className="w-full py-2.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:text-primary-700 hover:bg-primary-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-primary-200 dark:hover:border-slate-700 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isFull ? <><AlertTriangle size={16}/> Bus Full</> : <><Plus size={16}/> Assign Student</>}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* -------------------- TAB 2: VEHICLE MANAGEMENT -------------------- */}
      {activeTab === 'vehicles' && (
        <div className="space-y-6">
          {/* Vehicle Dashboard Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Total</span>
              <span className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-2">{totalVehiclesCount}</span>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Active</span>
              <span className="text-2xl font-black text-green-600 mt-2">{activeVehiclesCount}</span>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Assigned</span>
              <span className="text-2xl font-black text-primary-600 mt-2">{assignedVehiclesCount}</span>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Unassigned</span>
              <span className="text-2xl font-black text-amber-600 mt-2">{unassignedVehiclesCount}</span>
            </div>
            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Expiring (30d)</span>
              <span className="text-2xl font-black text-amber-700 mt-2">{expiringVehiclesCount}</span>
            </div>
            <div className="bg-red-50 p-4 rounded-2xl border border-red-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-bold text-red-600 uppercase tracking-wider">Expired Docs</span>
              <span className="text-2xl font-black text-red-700 mt-2">{expiredVehiclesCount}</span>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="relative w-full md:max-w-sm">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300">
                <Search size={18} />
              </span>
              <input 
                type="text" 
                placeholder="Search vehicles..." 
                value={vehicleSearchQuery}
                onChange={(e) => setVehicleSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm transition-all"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider">
                <Filter size={14}/> Filters:
              </div>
              <select
                value={vehicleStatusFilter}
                onChange={(e) => setVehicleStatusFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="Active">Active Only</option>
                <option value="Inactive">Inactive Only</option>
              </select>
              <select
                value={vehicleComplianceFilter}
                onChange={(e) => setVehicleComplianceFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
              >
                <option value="all">All Compliance Statuses</option>
                <option value="active">Documents Active</option>
                <option value="expiring">Expiring Soon (30 days)</option>
                <option value="expired">Has Expired Documents</option>
              </select>
            </div>
          </div>

          {/* Vehicles Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="overflow-x-auto w-full min-w-0">
              <table className="w-full text-left border-collapse min-w-max">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider">
                    <th className="py-4 px-6">Vehicle Details</th>
                    <th className="py-4 px-6">Registration No</th>
                    <th className="py-4 px-6">Capacity</th>
                    <th className="py-4 px-6">Compliance Status</th>
                    <th className="py-4 px-6">Assigned Route(s)</th>
                    <th className="py-4 px-6">Status</th>
                    <th className="py-4 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-600 dark:text-slate-300 font-medium">
                  {filteredVehicles.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-12 text-center text-slate-400 dark:text-slate-300">
                        <Bus size={40} className="mx-auto mb-2 text-slate-300" />
                        <p className="font-semibold text-slate-700 dark:text-slate-200">No vehicles found matching filters</p>
                      </td>
                    </tr>
                  ) : (
                    filteredVehicles.map(vehicle => {
                      const complianceStatus = getVehicleComplianceStatus(vehicle);
                      return (
                        <tr key={vehicle.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 px-6">
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white">{vehicle.vehicleName}</p>
                              <p className="text-xs text-slate-400 dark:text-slate-300 mt-0.5">{vehicle.vehicleModel}</p>
                            </div>
                          </td>
                          <td className="py-4 px-6 font-mono font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                            {vehicle.registrationNumber}
                          </td>
                          <td className="py-4 px-6 font-semibold text-slate-800 dark:text-slate-100">
                            {vehicle.seatingCapacity} seats
                          </td>
                          <td className="py-4 px-6">
                            {complianceStatus === 'expired' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-red-100 text-red-700 border border-red-200">
                                <ShieldAlert size={14}/> Expired Docs
                              </span>
                            ) : complianceStatus === 'expiring' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-700 border border-amber-200">
                                <AlertTriangle size={14}/> Expiring (30d)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-green-100 text-green-700 border border-green-200">
                                <CheckCircle2 size={14}/> All Compliant
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex flex-wrap gap-1.5 max-w-[200px]">
                              {vehicle.assignedRouteIds && vehicle.assignedRouteIds.length > 0 ? (
                                vehicle.assignedRouteIds.map(rid => (
                                  <span key={rid} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-bold text-slate-600 dark:text-slate-300">
                                    {getRouteName(rid)}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-slate-400 dark:text-slate-300 italic font-medium">None assigned</span>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              vehicle.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}>
                              {vehicle.status}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => { setSelectedVehicleToView(vehicle); setShowViewVehicleModal(true); }}
                                className="p-1.5 text-slate-400 dark:text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                title="View Details"
                              >
                                <Eye size={18} />
                              </button>
                              {hasEditPermission && (
                                <button 
                                  onClick={() => { setNewVehicle(vehicle); setVehicleErrors({}); setShowVehicleModal(true); }}
                                  className="p-1.5 text-slate-400 dark:text-slate-300 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                  title="Edit Vehicle"
                                >
                                  <Edit size={18} />
                                </button>
                              )}
                              {hasDeletePermission && (
                                <button 
                                  onClick={() => setVehicleConfirmDeleteState({ isOpen: true, id: vehicle.id, name: vehicle.vehicleName || vehicle.registrationNumber })}
                                  className="p-1.5 text-slate-400 dark:text-slate-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                  title="Delete Vehicle"
                                >
                                  <Trash2 size={18} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* -------------------- TAB 3: STUDENT ASSIGNMENTS -------------------- */}
      {activeTab === 'assignments' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300" size={18} />
              <input 
                type="text" 
                placeholder="Search by student name, admission no, or route..." 
                value={assignmentSearchQuery}
                onChange={(e) => setAssignmentSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm transition-all"
              />
            </div>
            <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              Showing {filteredStudents.length} Students
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="overflow-x-auto w-full min-w-0">
              <table className="w-full text-left border-collapse min-w-max">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider">
                    <th className="py-4 px-6">Student</th>
                    <th className="py-4 px-6">Admission No</th>
                    <th className="py-4 px-6">Assigned Route</th>
                    <th className="py-4 px-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-600 dark:text-slate-300 font-medium">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="py-12 text-center text-slate-400 dark:text-slate-300">
                        <Users size={40} className="mx-auto mb-2 text-slate-300" />
                        <p className="font-semibold text-slate-700 dark:text-slate-200">No students found matching your criteria</p>
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map(student => {
                      const assignedRoute = routes.find(r => r.id === student.transportRouteId);
                      return (
                        <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 px-6 font-bold text-slate-900 dark:text-white">
                            {student.firstName} {student.lastName}
                          </td>
                          <td className="py-4 px-6 font-mono text-xs text-slate-500 dark:text-slate-400">
                            {student.admissionNumber || 'N/A'}
                          </td>
                          <td className="py-4 px-6">
                            {assignedRoute ? (
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-50 text-primary-700 rounded-lg font-bold text-xs border border-primary-200">
                                  <Bus size={14} /> {assignedRoute.name}
                                </span>
                                <span className="font-mono text-xs text-slate-400 dark:text-slate-300">
                                  ({assignedRoute.vehicleNumber})
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-300 italic">Self Transport / Not Assigned</span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-right">
                            {hasEditPermission && (
                              assignedRoute ? (
                                <button
                                  onClick={() => handleUnassignStudent(assignedRoute.id, student.id)}
                                  className="text-red-600 hover:text-red-700 font-bold text-xs bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                  Unassign
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setSelectedStudentId(student.id);
                                    if (routes.length > 0) setActiveRouteId(routes[0].id);
                                    setShowAssignModal(true);
                                  }}
                                  className="text-primary-600 hover:text-primary-700 font-bold text-xs bg-primary-50 hover:bg-primary-100 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                  Assign Route
                                </button>
                              )
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* -------------------- MODAL: CREATE / EDIT ROUTE -------------------- */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 dark:border-slate-800 animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {newRoute.id ? 'Edit Transport Route' : 'Add New Route'}
              </h3>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="p-2 text-slate-400 dark:text-slate-300 hover:text-slate-600 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateRoute} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Route Name *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. North Campus Express"
                  value={newRoute.name}
                  onChange={(e) => setNewRoute({...newRoute, name: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Assign School Vehicle</label>
                <select 
                  value={newRoute.vehicleId || ''}
                  onChange={(e) => {
                    const selVeh = vehicles.find(v => v.id === e.target.value);
                    setNewRoute({
                      ...newRoute, 
                      vehicleId: e.target.value,
                      vehicleNumber: selVeh ? selVeh.registrationNumber : ''
                    });
                  }}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                >
                  <option value="">-- Select Registered Vehicle (Optional) --</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.vehicleName || v.registrationNumber} ({v.registrationNumber}) - {v.seatingCapacity} seats
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Route / Vehicle Number</label>
                <input 
                  type="text" 
                  placeholder="e.g. TN-38-AB-1234 or Route 04"
                  value={newRoute.vehicleNumber || newRoute.routeNumber || ''}
                  onChange={(e) => setNewRoute({...newRoute, vehicleNumber: e.target.value, routeNumber: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Driver Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Moorthy"
                    value={newRoute.driverName}
                    onChange={(e) => setNewRoute({...newRoute, driverName: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Driver Phone</label>
                  <input 
                    type="tel" 
                    placeholder="10-digit number"
                    value={newRoute.driverPhone}
                    onChange={(e) => setNewRoute({...newRoute, driverPhone: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Seating Capacity *</label>
                <input 
                  type="number" 
                  min="1"
                  required
                  placeholder="e.g. 30"
                  value={newRoute.capacity}
                  onChange={(e) => setNewRoute({...newRoute, capacity: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                />
              </div>

              {/* Custom Fields */}
              <div className="pt-2">
                <CustomFieldsRenderer
                  moduleName="transport"
                  customData={newRoute.customData || {}}
                  onChange={(updatedCustomData) => setNewRoute(prev => ({ ...prev, customData: updatedCustomData }))}
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowCreateModal(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={creating}
                  className="px-5 py-2.5 rounded-xl bg-primary-600 font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {creating ? 'Saving...' : (newRoute.id ? 'Update Route' : 'Create Route')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------- MODAL: ASSIGN STUDENT -------------------- */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-100 dark:border-slate-800 animate-scale-up">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Assign Student to Route</h3>
              <button 
                onClick={() => setShowAssignModal(false)}
                className="p-2 text-slate-400 dark:text-slate-300 hover:text-slate-600 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAssignStudent} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Selected Route</label>
                <select 
                  value={activeRouteId || ''} 
                  onChange={(e) => setActiveRouteId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold focus:outline-none"
                >
                  {routes.map(r => (
                    <option key={r.id} value={r.id} disabled={r.assignedStudents?.length >= r.capacity}>
                      {r.name} ({r.assignedStudents?.length || 0}/{r.capacity}) {r.assignedStudents?.length >= r.capacity ? '- FULL' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Select Student *</label>
                <select 
                  required
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                >
                  <option value="">-- Choose an unassigned student --</option>
                  {unassignedStudents.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} ({s.admissionNumber || 'No Adm No'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowAssignModal(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={assigning || !selectedStudentId}
                  className="px-5 py-2.5 rounded-xl bg-primary-600 font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {assigning ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------- MODAL: VIEW ROUTE DETAILS -------------------- */}
      {showViewModal && selectedRouteToView && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 dark:border-slate-800 animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{selectedRouteToView.name}</h3>
                <span className="inline-flex mt-1 px-2.5 py-0.5 bg-slate-100 dark:bg-slate-700 font-mono text-xs font-bold rounded-md text-slate-700 dark:text-slate-200">
                  {selectedRouteToView.vehicleNumber}
                </span>
              </div>
              <button 
                onClick={() => setShowViewModal(false)}
                className="p-2 text-slate-400 dark:text-slate-300 hover:text-slate-600 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl mb-6">
              <div>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Driver</p>
                <p className="font-bold text-slate-800 dark:text-slate-100">{selectedRouteToView.driverName || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Driver Phone</p>
                <p className="font-bold text-slate-800 dark:text-slate-100">{selectedRouteToView.driverPhone || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Capacity</p>
                <p className="font-bold text-slate-800 dark:text-slate-100">{selectedRouteToView.capacity} Seats</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Occupancy</p>
                <p className="font-bold text-primary-600">{selectedRouteToView.assignedStudents?.length || 0} Students</p>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 dark:text-white mb-3 text-sm uppercase tracking-wider">Assigned Students</h4>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden max-h-60 overflow-y-auto">
                {(!selectedRouteToView.assignedStudents || selectedRouteToView.assignedStudents.length === 0) ? (
                  <p className="p-4 text-center text-sm text-slate-400 dark:text-slate-300">No students currently assigned to this route.</p>
                ) : (
                  selectedRouteToView.assignedStudents.map(studentId => {
                    const student = students.find(s => s.id === studentId);
                    return (
                      <div key={studentId} className="p-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">{student ? `${student.firstName} ${student.lastName}` : 'Unknown Student'}</p>
                          <p className="text-xs font-mono text-slate-400 dark:text-slate-300">{student?.admissionNumber}</p>
                        </div>
                        {hasEditPermission && (
                          <button 
                            onClick={() => handleUnassignStudent(selectedRouteToView.id, studentId)}
                            className="text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors"
                          >
                            Unassign
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Custom Data in View Modal */}
            {selectedRouteToView.customData && Object.keys(selectedRouteToView.customData).length > 0 && (
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                <h4 className="font-bold text-slate-900 dark:text-white mb-3 text-sm uppercase tracking-wider">Additional Information</h4>
                <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl">
                  {Object.entries(selectedRouteToView.customData).map(([key, value]) => (
                    <div key={key}>
                      <p className="text-xs font-semibold text-slate-400 dark:text-slate-300 uppercase tracking-wider capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                      <p className="font-bold text-slate-800 dark:text-slate-100">{String(value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------- MODAL: CREATE / EDIT VEHICLE -------------------- */}
      {showVehicleModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 dark:border-slate-800 animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {newVehicle.id ? 'Edit Vehicle Details' : 'Register New Vehicle'}
              </h3>
              <button 
                onClick={() => setShowVehicleModal(false)}
                className="p-2 text-slate-400 dark:text-slate-300 hover:text-slate-600 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveVehicle} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Vehicle Display Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Yellow Bus 04"
                    value={newVehicle.vehicleName || ''}
                    onChange={(e) => setNewVehicle({...newVehicle, vehicleName: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Vehicle Make / Model</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Tata Starbus 32-Seater"
                    value={newVehicle.vehicleModel || ''}
                    onChange={(e) => setNewVehicle({...newVehicle, vehicleModel: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Registration Number *</label>
                  <input 
                    type="text" required
                    placeholder="e.g. TN 56 K 1146 or MH-12-PQ-4567"
                    value={newVehicle.registrationNumber || ''}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setNewVehicle({...newVehicle, registrationNumber: val});
                      setVehicleErrors(prev => ({ ...prev, registrationNumber: null }));
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl border font-mono uppercase ${
                      vehicleErrors.registrationNumber 
                        ? 'border-red-500 focus:ring-red-500 bg-red-50/50 dark:bg-red-900/10' 
                        : 'border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900'
                    }`}
                  />
                  {vehicleErrors.registrationNumber && (
                    <p className="text-red-600 text-xs mt-1 font-semibold flex items-center gap-1">
                      <AlertTriangle size={12} /> {vehicleErrors.registrationNumber}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Seating Capacity *</label>
                  <input 
                    type="number" min="1" required
                    placeholder="e.g. 32"
                    value={newVehicle.seatingCapacity || ''}
                    onChange={(e) => setNewVehicle({...newVehicle, seatingCapacity: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Assigned Routes</label>
                  <select 
                    multiple
                    value={newVehicle.assignedRouteIds || []}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions, option => option.value);
                      setNewVehicle({...newVehicle, assignedRouteIds: selected});
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 min-h-[90px]"
                  >
                    {routes.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.vehicleNumber})
                      </option>
                    ))}
                  </select>
                  <p className="text-slate-400 dark:text-slate-300 text-xs mt-1.5">Hold <kbd className="font-mono bg-slate-100 dark:bg-slate-700 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700">Ctrl</kbd> (or <kbd className="font-mono bg-slate-100 dark:bg-slate-700 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700">Cmd</kbd> on Mac) to select multiple routes.</p>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Vehicle Status *</label>
                  <select 
                    value={newVehicle.status || 'Active'}
                    onChange={(e) => setNewVehicle({...newVehicle, status: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900 appearance-none cursor-pointer"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 dark:border-slate-800 mt-6">
                <h4 className="font-bold text-slate-900 dark:text-white mb-4 text-sm uppercase tracking-wider">Compliance & Expiry Dates</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Fitness Certificate (FC) Expiry *</label>
                    <input 
                      type="date" required
                      value={newVehicle.fcExpiryDate || ''}
                      onChange={(e) => setNewVehicle({...newVehicle, fcExpiryDate: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Insurance Expiry Date *</label>
                    <input 
                      type="date" required
                      value={newVehicle.insuranceExpiryDate || ''}
                      onChange={(e) => setNewVehicle({...newVehicle, insuranceExpiryDate: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Pollution Certificate (PUCC) Expiry</label>
                    <input 
                      type="date"
                      value={newVehicle.pollutionCertificateExpiryDate || ''}
                      onChange={(e) => setNewVehicle({...newVehicle, pollutionCertificateExpiryDate: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Transport Permit Expiry Date</label>
                    <input 
                      type="date"
                      value={newVehicle.permitExpiryDate || ''}
                      onChange={(e) => setNewVehicle({...newVehicle, permitExpiryDate: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Road Tax Renewal Date</label>
                    <input 
                      type="date"
                      value={newVehicle.roadTaxExpiryDate || ''}
                      onChange={(e) => setNewVehicle({...newVehicle, roadTaxExpiryDate: e.target.value})}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setShowVehicleModal(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={savingVehicle}
                  className="px-5 py-2.5 rounded-xl bg-primary-600 font-semibold text-white hover:bg-primary-700 disabled:opacity-50 shadow-md shadow-primary-500/20"
                >
                  {savingVehicle ? 'Saving...' : (newVehicle.id ? 'Save Changes' : 'Register Vehicle')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------- MODAL: VIEW VEHICLE DETAILS -------------------- */}
      {showViewVehicleModal && selectedVehicleToView && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 dark:border-slate-800 animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{selectedVehicleToView.vehicleName || 'Vehicle Information'}</h3>
                <p className="font-mono text-sm font-bold text-primary-600 dark:text-primary-400 mt-1 uppercase tracking-wide">{selectedVehicleToView.registrationNumber}</p>
              </div>
              <button 
                onClick={() => setShowViewVehicleModal(false)}
                className="p-2 text-slate-400 dark:text-slate-300 hover:text-slate-600 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Basic Details Box */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl">
                <div>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Make / Model</p>
                  <p className="font-bold text-slate-800 dark:text-slate-100 mt-0.5">{selectedVehicleToView.vehicleModel || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Seating Capacity</p>
                  <p className="font-bold text-slate-800 dark:text-slate-100 mt-0.5">{selectedVehicleToView.seatingCapacity} seats</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Operational Status</p>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold mt-1 border ${
                    selectedVehicleToView.status === 'Active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}>
                    {selectedVehicleToView.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Assigned Routes</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedVehicleToView.assignedRouteIds && selectedVehicleToView.assignedRouteIds.length > 0 ? (
                      selectedVehicleToView.assignedRouteIds.map(rid => (
                        <span key={rid} className="px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs font-bold">
                          {getRouteName(rid)}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-300 italic font-medium">None</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Compliance Status Block */}
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-4 text-sm uppercase tracking-wider">Compliance Status</h4>
                <div className="space-y-3">
                  {[
                    { label: 'Fitness Certificate (FC)', date: selectedVehicleToView.fcExpiryDate },
                    { label: 'Insurance Policy', date: selectedVehicleToView.insuranceExpiryDate },
                    { label: 'Pollution Certificate (PUCC)', date: selectedVehicleToView.pollutionCertificateExpiryDate },
                    { label: 'Transport Permit', date: selectedVehicleToView.permitExpiryDate },
                    { label: 'Road Tax', date: selectedVehicleToView.roadTaxExpiryDate }
                  ].map(doc => {
                    const status = getExpiryStatus(doc.date);
                    return (
                      <div key={doc.label} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                        <div className="flex items-center gap-3">
                          <Calendar size={18} className="text-slate-400 dark:text-slate-300" />
                          <div>
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{doc.label}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-300 font-mono">{doc.date || 'Not specified'}</p>
                          </div>
                        </div>
                        <div>
                          {status === 'expired' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-red-100 text-red-700 border border-red-200">
                              <ShieldAlert size={12}/> Expired
                            </span>
                          ) : status === 'expiring' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-700 border border-amber-200">
                              <AlertTriangle size={12}/> Expiring Soon
                            </span>
                          ) : doc.date ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-green-100 text-green-700 border border-green-200">
                              <CheckCircle2 size={12}/> Valid
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-300 italic">No Record</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Route Confirmation */}
      <ConfirmModal 
        isOpen={confirmDeleteState.isOpen}
        title="Delete Transport Route"
        message={`Are you sure you want to delete "${confirmDeleteState.name}"? All student assignments will be unlinked.`}
        confirmText="Delete Route"
        onConfirm={handleDeleteRoute}
        onCancel={() => setConfirmDeleteState({ isOpen: false, id: null, name: '' })}
      />

      {/* Delete Vehicle Confirmation */}
      <ConfirmModal 
        isOpen={vehicleConfirmDeleteState.isOpen}
        title="Delete Registered Vehicle"
        message={`Are you sure you want to delete vehicle "${vehicleConfirmDeleteState.name}"?`}
        confirmText="Delete Vehicle"
        onConfirm={handleDeleteVehicle}
        onCancel={() => setVehicleConfirmDeleteState({ isOpen: false, id: null, name: '' })}
      />
    </div>
  );
}
