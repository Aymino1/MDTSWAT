import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import "./map-fix.css";

/**
 * Configuration
 * Assure-toi que VITE_API_URL pointe bien vers ton serveur (ou laisse default http://localhost:4000)
 */
const API = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

/* ---------- Helpers ---------- */
function getTokenHeader() {
  const t = localStorage.getItem("mtd_token");
  return t ? { Authorization: "Bearer " + t } : {};
}

/* ---------- Main App ---------- */
export default function App() {
  const [tab, setTab] = useState("map");
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("mtd_user"));
    } catch {
      return null;
    }
  });

  // small state caches
  const [members, setMembers] = useState([]);
  const [tactics, setTactics] = useState([]);
  const [operations, setOperations] = useState([]);
  const [squads, setSquads] = useState([]);
  const [plans, setPlans] = useState([]);
  const [mapMarkers, setMapMarkers] = useState([]);

  // permissions fetched from server? We'll infer permissions via ability to call endpoints:
  const [can, setCan] = useState({
    manage_tactics: false,
    manage_members: false,
    manage_permissions: false,
    manage_operations: false,
    manage_squads: false,
    manage_plans: false,
    view_map: false,
  });

  useEffect(() => {
    if (user) {
      // optimistic: set permissions based on role 'admin' seed
      if (user.role === "admin") {
        setCan({
          manage_tactics: true,
          manage_members: true,
          manage_permissions: true,
          manage_operations: true,
          manage_squads: true,
          manage_plans: true,
          view_map: true,
        });
      } else {
        // for non-admin we try to call endpoints and fallback on server responses
        setCan(prev => ({ ...prev }));
      }
      refreshData();
    }
  }, [user]);

  async function refreshData() {
    await Promise.allSettled([fetchMembers(), fetchTactics(), fetchOperations(), fetchSquads(), fetchPlans(), fetchMapMarkers()]);
  }

  async function fetchMembers() {
    try {
      const res = await axios.get(API + "/members", { headers: getTokenHeader() });
      setMembers(res.data);
    } catch (e) {
      // ignore for not authorized
    }
  }

  async function fetchTactics() {
    try {
      const res = await axios.get(API + "/tactics", { headers: getTokenHeader() });
      setTactics(res.data);
    } catch (e) {}
  }

  async function fetchOperations() {
    try {
      const res = await axios.get(API + "/operations", { headers: getTokenHeader() });
      setOperations(res.data);
    } catch (e) {}
  }

  async function fetchSquads() {
    try {
      const res = await axios.get(API + "/squads", { headers: getTokenHeader() });
      setSquads(res.data);
    } catch (e) {}
  }

  async function fetchPlans() {
    try {
      const res = await axios.get(API + "/tactical-plans", { headers: getTokenHeader() });
      setPlans(res.data);
    } catch (e) {}
  }

  async function fetchMapMarkers() {
    try {
      const res = await axios.get(API + "/map/markers", { headers: getTokenHeader() });
      setMapMarkers(res.data);
    } catch (e) {}
  }

  /* ---------- Auth ---------- */
  async function doLogin(username, password) {
    try {
      const res = await axios.post(API + "/auth/login", { username, password });
      localStorage.setItem("mtd_token", res.data.token);
      localStorage.setItem("mtd_user", JSON.stringify(res.data.user));
      setUser(res.data.user);
      refreshData();
      alert("Connecté en tant que " + res.data.user.username);
    } catch (e) {
      alert("Échec de connexion");
    }
  }

  function logout() {
    localStorage.removeItem("mtd_token");
    localStorage.removeItem("mtd_user");
    setUser(null);
    setCan({});
  }

  /* ---------- Members (create & assign permission) ---------- */
  async function createMember({ username, password, displayName, role }) {
    try {
      await axios.post(API + "/members", { username, password, displayName, role }, { headers: getTokenHeader() });
      await fetchMembers();
      alert("Membre créé");
    } catch (e) {
      alert("Erreur création membre : " + (e?.response?.data?.error || e.message));
    }
  }

  async function createPermission(name, description) {
    try {
      await axios.post(API + "/admin/permissions", { name, description }, { headers: getTokenHeader() });
      alert("Permission créée");
    } catch (e) {
      alert("Erreur création permission : " + (e?.response?.data?.error || e.message));
    }
  }

  async function assignPermission(userId, permissionName) {
    try {
      await axios.post(API + "/admin/assign-permission", { userId, permissionName }, { headers: getTokenHeader() });
      alert("Permission assignée");
    } catch (e) {
      alert("Erreur assignation : " + (e?.response?.data?.error || e.message));
    }
  }

  /* ---------- Tactiques (create: image + description) ---------- */
  async function createTactic({ title, imageBase64, description }) {
    try {
      // we'll put image + description into 'content' as JSON string (server currently saves content field)
      const content = JSON.stringify({ description, imageBase64 });
      await axios.post(API + "/tactics", { title, content }, { headers: getTokenHeader() });
      await fetchTactics();
      alert("Tactique créée");
    } catch (e) {
      alert("Erreur création tactique: " + (e?.response?.data?.error || e.message));
    }
  }

  /* ---------- Operations (create) ---------- */
  async function createOperation({ name, description, status, location, evidenceBase64 }) {
    try {
      // server accepts name/description/status; we'll pack location + evidence into description JSON
      const payloadDesc = JSON.stringify({ description, location, evidenceBase64 });
      await axios.post(API + "/operations", { name, description: payloadDesc, status }, { headers: getTokenHeader() });
      await fetchOperations();
      alert("Opération créée");
    } catch (e) {
      alert("Erreur création opération: " + (e?.response?.data?.error || e.message));
    }
  }

  /* ---------- Squads (create) ---------- */
  async function createSquad({ name, description }) {
    try {
      await axios.post(API + "/squads", { name, description }, { headers: getTokenHeader() });
      await fetchSquads();
      alert("Escouade créée");
    } catch (e) {
      alert("Erreur création escouade: " + (e?.response?.data?.error || e.message));
    }
  }

  /* ---------- Tactical plan (upload image + draw) ---------- */
  async function createTacticalPlan({ title, imageBase64WithDrawing }) {
    try {
      // server expects title + body -> we send body = JSON with merged image
      const body = JSON.stringify({ mergedImage: imageBase64WithDrawing });
      await axios.post(API + "/tactical-plans", { title, body }, { headers: getTokenHeader() });
      await fetchPlans();
      alert("Plan tactique sauvegardé");
    } catch (e) {
      alert("Erreur création plan tactique: " + (e?.response?.data?.error || e.message));
    }
  }

  /* ---------- UI ---------- */
  return (
    <div className="app-root">
      <header className="app-header">
        <div className="header-left">
          <div className="logo">SWAT</div>
          <div className="title-small">MDT</div>
        </div>

        <nav className="header-nav">
          <button className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}>Carte</button>
          <button className={tab === "tactics" ? "active" : ""} onClick={() => setTab("tactics")}>Tactiques</button>
          <button className={tab === "members" ? "active" : ""} onClick={() => setTab("members")}>Membres</button>
          <button className={tab === "operations" ? "active" : ""} onClick={() => setTab("operations")}>Opérations</button>
          <button className={tab === "squads" ? "active" : ""} onClick={() => setTab("squads")}>Escouades</button>
          <button className={tab === "plans" ? "active" : ""} onClick={() => setTab("plans")}>Plan Tactique</button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>Paramètres</button>
        </nav>

        <div className="header-right">
          {user ? (
            <>
              <div className="user-chip">{user.username}</div>
              <button className="btn logout" onClick={logout}>Déconnexion</button>
            </>
          ) : (
            <MiniLogin onLogin={doLogin} />
          )}
        </div>
      </header>

      <main className="app-main">
        <div className="gyro blue" />
        <div className="gyro red" />

        {/* WELCOME (center) */}
        {tab === "home" && (
          <section className="panel centered">
            <h1 style={{ textTransform: "uppercase" }}>BIENVENUE SUR LE SYSTÈME MDT SWAT</h1>
            <p className="muted">DIVISION DU SPECIAL WEAPONS AND TACTICS</p>
          </section>
        )}

        {/* MAP */}
        {tab === "map" && (
          <MapView markers={mapMarkers} refreshMarkers={fetchMapMarkers} canCreate={can.manage_map} />
        )}

        {/* TACTICS */}
        {tab === "tactics" && (
          <TacticsView
            tactics={tactics}
            createTactic={createTactic}
            canCreate={user && (user.role === "admin" || can.manage_tactics)}
          />
        )}

        {/* MEMBERS */}
        {tab === "members" && (
          <MembersView
            members={members}
            fetchMembers={fetchMembers}
            createMember={createMember}
            createPermission={createPermission}
            assignPermission={assignPermission}
            canManage={user && (user.role === "admin" || can.manage_members)}
            canManagePermissions={user && (user.role === "admin" || can.manage_permissions)}
          />
        )}

        {/* OPERATIONS */}
        {tab === "operations" && (
          <OperationsView operations={operations} createOperation={createOperation} canCreate={user && (user.role === "admin" || can.manage_operations)} />
        )}

        {/* SQUADS */}
        {tab === "squads" && (
          <SquadsView squads={squads} members={members} createSquad={createSquad} />
        )}

        {/* PLANS */}
        {tab === "plans" && (
          <PlansView plans={plans} createTacticalPlan={createTacticalPlan} canCreate={user && (user.role === "admin" || can.manage_plans)} />
        )}

        {/* SETTINGS */}
        {tab === "settings" && (
          <section className="panel">
            <h2>Paramètres & Administration</h2>
            <p className="muted">Créer des comptes, gérer les permissions (Admin requis)</p>
            <p>Utilise l'onglet Membres pour créer des comptes et assigner des permissions.</p>
          </section>
        )}
      </main>

      <footer className="app-footer">© 2025 Los Santos SWAT</footer>
    </div>
  );
}

/* ---------- MiniLogin component (small) ---------- */
function MiniLogin({ onLogin }) {
  const [u, setU] = useState("admin");
  const [p, setP] = useState("admin123");
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input className="mini-input" value={u} onChange={(e) => setU(e.target.value)} />
      <input className="mini-input" value={p} onChange={(e) => setP(e.target.value)} type="password" />
      <button className="btn" onClick={() => onLogin(u, p)}>Connexion</button>
    </div>
  );
}

/* ---------- MapView ---------- */
function MapView({ markers, refreshMarkers, canCreate }) {
  // check if public/los_santos.jpg exists by attempting to fetch it (client-side)
  const [lsImageAvailable, setLsImageAvailable] = useState(false);
  useEffect(() => {
    fetch("/los_santos.jpg", { method: "HEAD" }).then(r => {
      if (r.ok) setLsImageAvailable(true);
    }).catch(() => {});
  }, []);

  return (
    <section className="panel map-panel">
      <div className="map-left">
        <h2>Carte de Los Santos</h2>
        <div className="map-container">
          <MapContainer center={[34.0522, -118.2437]} zoom={12} style={{ height: "100%", width: "100%" }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {markers && markers.map(m => (
              <Marker key={m.id} position={[m.lat, m.lng]}>
                <Popup>
                  <strong>{m.title}</strong>
                  <div>{m.description}</div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>

      <aside className="map-right">
        <h3>Référence</h3>
        {lsImageAvailable ? (
          <img src="/los_santos.jpg" alt="Los Santos" style={{ width: "100%", borderRadius: 8 }} />
        ) : (
          <div className="muted">Ajoute un fichier <code>client/public/los_santos.jpg</code> pour l'afficher ici.</div>
        )}
      </aside>
    </section>
  );
}

/* ---------- TacticsView (list + create) ---------- */
function TacticsView({ tactics, createTactic, canCreate }) {
  const [showCreate, setShowCreate] = useState(false);
  return (
    <section className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Tactiques</h2>
        {canCreate ? <button className="btn" onClick={() => setShowCreate(s => !s)}>+ Ajouter</button> : <div className="muted">Droits requis pour créer</div>}
      </div>

      {showCreate && <TacticForm onCreate={createTactic} />}

      <div style={{ marginTop: 12 }}>
        {tactics.length === 0 && <div className="muted">Aucune tactique enregistrée</div>}
        {tactics.map(t => {
          // content may be JSON containing description+imageBase64
          let parsed = null;
          try { parsed = JSON.parse(t.content || "{}"); } catch { parsed = null; }
          return (
            <div key={t.id} className="card">
              <h3>{t.title}</h3>
              {parsed?.imageBase64 && <img src={parsed.imageBase64} alt="tactic" style={{ maxWidth: 320, borderRadius: 6 }} />}
              <p>{parsed?.description || t.content}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- Tactic form (image upload + desc) ---------- */
function TacticForm({ onCreate }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [image, setImage] = useState(null);

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result);
    reader.readAsDataURL(f);
  }

  async function submit() {
    if (!title) return alert("Titre requis");
    await onCreate({ title, imageBase64: image, description: desc });
    setTitle(""); setDesc(""); setImage(null);
  }

  return (
    <div className="card form">
      <input placeholder="Titre" value={title} onChange={e => setTitle(e.target.value)} />
      <textarea placeholder="Description" value={desc} onChange={e => setDesc(e.target.value)} />
      <input type="file" accept="image/*" onChange={handleFile} />
      {image && <img src={image} alt="preview" style={{ width: 160, marginTop: 8, borderRadius: 6 }} />}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn" onClick={submit}>Enregistrer</button>
      </div>
    </div>
  );
}

/* ---------- Members view ---------- */
function MembersView({ members, fetchMembers, createMember, createPermission, assignPermission, canManage, canManagePermissions }) {
  const [showCreate, setShowCreate] = useState(false);
  const [permName, setPermName] = useState("");
  const [permDesc, setPermDesc] = useState("");
  const [assignUserId, setAssignUserId] = useState("");
  const [assignPerm, setAssignPerm] = useState("");

  useEffect(() => { fetchMembers(); }, []);

  return (
    <section className="panel">
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>Membres</h2>
        {canManage ? <button className="btn" onClick={() => setShowCreate(s => !s)}>+ Créer un compte</button> : <div className="muted">Droits requis</div>}
      </div>

      {showCreate && <MemberForm onCreate={createMember} />}

      <div style={{ marginTop: 12 }}>
        <table className="table">
          <thead><tr><th>ID</th><th>Username</th><th>Display</th><th>Role</th></tr></thead>
          <tbody>
            {members.map(m => <tr key={m.id}><td>{m.id}</td><td>{m.username}</td><td>{m.display_name}</td><td>{m.role}</td></tr>)}
          </tbody>
        </table>
      </div>

      <hr style={{ margin: "12px 0", borderColor: "#222" }} />

      <div>
        <h3>Gérer les permissions</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input placeholder="Nom permission (ex: manage_tactics)" value={permName} onChange={e => setPermName(e.target.value)} />
          <input placeholder="Description" value={permDesc} onChange={e => setPermDesc(e.target.value)} />
          <button className="btn" onClick={() => { if (!canManagePermissions) return alert("Permission requise"); createPermission(permName, permDesc); }}>Créer</button>
        </div>

        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <select value={assignUserId} onChange={e => setAssignUserId(e.target.value)}>
            <option value="">Sélectionner un utilisateur</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.username}</option>)}
          </select>
          <input placeholder="nom permission" value={assignPerm} onChange={e => setAssignPerm(e.target.value)} />
          <button className="btn" onClick={() => { if (!canManagePermissions) return alert("Permission requise"); assignPermission(assignUserId, assignPerm); }}>Assigner</button>
        </div>
      </div>
    </section>
  );
}

function MemberForm({ onCreate }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  return (
    <div className="card form">
      <input placeholder="Pseudo (username)" value={username} onChange={e => setUsername(e.target.value)} />
      <input placeholder="Nom affiché" value={displayName} onChange={e => setDisplayName(e.target.value)} />
      <input placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} />
      <select value={role} onChange={e => setRole(e.target.value)}>
        <option value="user">user</option>
        <option value="admin">admin</option>
      </select>
      <button className="btn" onClick={() => onCreate({ username, password, displayName, role })}>Créer</button>
    </div>
  );
}

/* ---------- OperationsView ---------- */
function OperationsView({ operations, createOperation, canCreate }) {
  const [showCreate, setShowCreate] = useState(false);
  return (
    <section className="panel">
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>Opérations</h2>
        {canCreate ? <button className="btn" onClick={() => setShowCreate(s => !s)}>+ Nouvelle opération</button> : <div className="muted">Droits requis</div>}
      </div>

      {showCreate && <OperationForm onCreate={createOperation} />}

      <div style={{ marginTop: 12 }}>
        {operations.map(op => {
          let parsed = null;
          try { parsed = JSON.parse(op.description || "{}"); } catch { parsed = null; }
          return (
            <div className="card" key={op.id}>
              <h3>{op.name} <small style={{ color: "#aaa" }}>{op.status}</small></h3>
              <p>{parsed?.description || op.description}</p>
              {parsed?.location && <div><strong>Lieu:</strong> {parsed.location}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function OperationForm({ onCreate }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [status, setStatus] = useState("planned");
  const [location, setLocation] = useState("");
  const [evidence, setEvidence] = useState(null);

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setEvidence(reader.result);
    reader.readAsDataURL(f);
  }

  return (
    <div className="card form">
      <input placeholder="Nom opération" value={name} onChange={e => setName(e.target.value)} />
      <textarea placeholder="Description" value={desc} onChange={e => setDesc(e.target.value)} />
      <input placeholder="Lieu (adresse ou coords)" value={location} onChange={e => setLocation(e.target.value)} />
      <select value={status} onChange={e => setStatus(e.target.value)}>
        <option value="planned">Planned</option>
        <option value="ongoing">Ongoing</option>
        <option value="completed">Completed</option>
      </select>
      <input type="file" accept="image/*" onChange={handleFile} />
      {evidence && <img src={evidence} alt="evidence" style={{ width: 120, borderRadius: 6 }} />}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" onClick={() => onCreate({ name, description: desc, status, location, evidenceBase64: evidence })}>Créer</button>
      </div>
    </div>
  );
}

/* ---------- SquadsView ---------- */
function SquadsView({ squads, members, createSquad }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [leadId, setLeadId] = useState("");

  return (
    <section className="panel">
      <h2>Escouades</h2>

      <div className="card form">
        <input placeholder="Nom escouade" value={name} onChange={e => setName(e.target.value)} />
        <textarea placeholder="Description" value={desc} onChange={e => setDesc(e.target.value)} />
        <select value={leadId} onChange={e => setLeadId(e.target.value)}>
          <option value="">Choisir un lead</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.username}</option>)}
        </select>
        <button className="btn" onClick={() => {
          if (!name) return alert("Nom requis");
          const extra = desc + (leadId ? ` (lead:${leadId})` : "");
          createSquad({ name, description: extra });
        }}>Créer Escouade</button>
      </div>

      <div style={{ marginTop: 12 }}>
        {squads.length === 0 && <div className="muted">Aucune escouade</div>}
        {squads.map(s => <div className="card" key={s.id}><h3>{s.name}</h3><p>{s.description}</p></div>)}
      </div>
    </section>
  );
}

/* ---------- PlansView: upload image + draw ---------- */
function PlansView({ plans, createTacticalPlan, canCreate }) {
  return (
    <section className="panel">
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>Plans Tactiques</h2>
        {canCreate ? <div className="muted">Utilisez le formulaire ci-dessous pour importer et annoter une image</div> : <div className="muted">Droits requis</div>}
      </div>

      <TacticalPlanForm onSave={createTacticalPlan} canCreate={canCreate} />

      <div style={{ marginTop: 12 }}>
        {plans.map(p => {
          let parsed = null;
          try { parsed = JSON.parse(p.body || "{}"); } catch {}
          return (
            <div className="card" key={p.id}>
              <h3>{p.title}</h3>
              {parsed?.mergedImage && <img src={parsed.mergedImage} alt="plan" style={{ width: 460, borderRadius: 6 }} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* TacticalPlanForm: shows image upload and canvas for drawing */
function TacticalPlanForm({ onSave, canCreate }) {
  const [title, setTitle] = useState("");
  const [baseImage, setBaseImage] = useState(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [ctx, setCtx] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 1000;
    canvas.height = 600;
    const c = canvas.getContext("2d");
    c.lineCap = "round";
    c.lineWidth = 6;
    c.strokeStyle = "#fff";
    setCtx(c);
    // clear
    c.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  function handleFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      setBaseImage(r.result);
      // draw image into hidden image ref then scale canvas
      const img = new Image();
      img.onload = () => {
        // adjust canvas size dynamically
        const canvas = canvasRef.current;
        canvas.width = img.width;
        canvas.height = img.height;
        const c = canvas.getContext("2d");
        c.clearRect(0, 0, canvas.width, canvas.height);
      };
      img.src = r.result;
      imgRef.current = img;
    };
    r.readAsDataURL(f);
  }

  function onPointerDown(e) {
    if (!ctx) return;
    setDrawing(true);
    ctx.beginPath();
    const rect = canvasRef.current.getBoundingClientRect();
    ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
  }
  function onPointerMove(e) {
    if (!drawing || !ctx) return;
    ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    ctx.stroke();
  }
  function onPointerUp() {
    if (!ctx) return;
    setDrawing(false);
  }

  async function saveMerged() {
    if (!canCreate) return alert("Permission requise");
    if (!baseImage) return alert("Image requise");
    // draw base image on an offscreen canvas then draw current canvas overlay on top
    const baseImg = new Image();
    baseImg.src = baseImage;
    await new Promise((res) => (baseImg.onload = res));
    const off = document.createElement("canvas");
    off.width = baseImg.width;
    off.height = baseImg.height;
    const c = off.getContext("2d");
    c.drawImage(baseImg, 0, 0);
    // draw overlay
    c.drawImage(canvasRef.current, 0, 0);
    const merged = off.toDataURL("image/png");
    await onSave({ title: title || "Plan sans titre", imageBase64WithDrawing: merged });
    // reset
    setTitle("");
    setBaseImage(null);
    const ctx2 = canvasRef.current.getContext("2d");
    ctx2.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  }

  function clearDrawing() {
    if (!canvasRef.current) return;
    const c = canvasRef.current.getContext("2d");
    c.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  }

  return (
    <div className="card form">
      <input placeholder="Titre du plan" value={title} onChange={e => setTitle(e.target.value)} />
      <input type="file" accept="image/*" onChange={handleFile} />
      <div style={{ marginTop: 8, border: "1px solid #222", borderRadius: 6, overflow: "hidden" }}>
        {baseImage ? (
          <div style={{ position: "relative" }}>
            <img src={baseImage} alt="base" style={{ width: "100%", display: "block" }} />
            {/* Canvas overlay positioned absolutely on top */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                style={{ width: "100%", height: "100%", cursor: "crosshair" }}
              />
            </div>
          </div>
        ) : (
          <div className="muted">Aucune image sélectionnée</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn" onClick={saveMerged}>Sauvegarder le plan</button>
        <button className="btn" onClick={clearDrawing}>Effacer dessin</button>
      </div>
    </div>
  );
}
