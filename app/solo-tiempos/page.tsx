"use client";

import { useEffect, useState } from "react";
import EstudioTiempos from "../tiempos";
import type { TiemposCelula } from "@/lib/tiempos";

/*
 * Plataforma de Estudio de Tiempos aparte del hub. Corre del mismo
 * código y contra la MISMA base del hub (los registros son los
 * mismos), pero solo muestra tiempos. Se usa en el despliegue con
 * TIEMPOS_ONLY=1; el middleware manda la raíz "/" aquí.
 */
type Me = {
  authenticated: boolean;
  email: string | null;
  role: string | null;
  celulas: ("alpha" | "gamma")[];
  gmc?: boolean;
  atty?: boolean;
};

const LABEL: Record<string, string> = {
  alpha: "Alpha",
  gamma: "Gamma",
  gmc: "GMC",
  atty: "Atty",
};

const vistasDe = (me: Me): TiemposCelula[] => [
  ...me.celulas,
  ...(me.gmc ? (["gmc"] as const) : []),
  ...(me.atty ? (["atty"] as const) : []),
];

export default function SoloTiempos() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<TiemposCelula | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Me) => {
        setMe(j);
        if (j.authenticated) setVista(vistasDe(j)[0] || "alpha");
      })
      .catch(() =>
        setMe({ authenticated: false, email: null, role: null, celulas: [] })
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="centerScreen">Cargando Estudio de Tiempos…</div>;
  }

  if (!me?.authenticated) {
    return (
      <div className="loginScreen">
        <div className="loginCard">
          <div className="logoMark">⏱</div>
          <h1>Estudio de Tiempos</h1>
          <p>Registro de actividades</p>
          <button
            className="primaryButton"
            onClick={() => (window.location.href = "/api/auth/login")}
          >
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  const vistas = vistasDe(me);

  return (
    <div className="soloTiemposApp">
      <header className="soloTiemposBar">
        <div className="soloTiemposBrand">
          <span className="logoMark small">⏱</span>
          <strong>Estudio de Tiempos</strong>
        </div>

        <div className="soloTiemposRight">
          {vistas.length > 1 && (
            <select
              className="soloTiemposVista"
              value={vista ?? ""}
              onChange={(e) => setVista(e.target.value as TiemposCelula)}
              aria-label="Vista"
            >
              {vistas.map((v) => (
                <option key={v} value={v}>
                  {LABEL[v] || v}
                </option>
              ))}
            </select>
          )}

          <span className="soloTiemposUser">{me.email}</span>

          <button
            className="rgBtn rgBtnGhost"
            onClick={() => (window.location.href = "/api/auth/logout")}
          >
            Salir
          </button>
        </div>
      </header>

      <main className="soloTiemposMain">
        {vista && <EstudioTiempos key={vista} celula={vista} clientes={[]} />}
      </main>
    </div>
  );
}
