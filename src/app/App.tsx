// Routage (par hash, compatible GitHub Pages et hors ligne) et mise en page mobile.
import { HashRouter, Navigate, NavLink, Outlet, Route, Routes, useParams } from 'react-router-dom';
import { Accueil } from '../features/Accueil';
import { Bibliotheque } from '../features/Bibliotheque';
import { Courses } from '../features/Courses';
import { Cuisine } from '../features/Cuisine';
import { FicheRecette } from '../features/FicheRecette';
import { Importer } from '../features/Importer';
import { Placard } from '../features/Placard';
import { Reglages } from '../features/Reglages';
import { SemaineRepas } from '../features/SemaineRepas';
import { Session } from '../features/Session';
import { AucunPlan, EnChargement } from '../ui/composants';
import { semaineCourante, usePlanActif } from './hooks';

function Layout() {
  return (
    <div className="app">
      <main className="contenu">
        <Outlet />
      </main>
      <nav className="nav-bas" aria-label="Navigation principale">
        <NavLink to="/" end>
          <span aria-hidden="true">📅</span>Plan
        </NavLink>
        <NavLink to="/courses">
          <span aria-hidden="true">🛒</span>Courses
        </NavLink>
        <NavLink to="/session">
          <span aria-hidden="true">🍳</span>Session
        </NavLink>
        <NavLink to="/recettes">
          <span aria-hidden="true">📖</span>Recettes
        </NavLink>
        <NavLink to="/reglages">
          <span aria-hidden="true">⚙️</span>Réglages
        </NavLink>
      </nav>
    </div>
  );
}

/** /courses et /session ouvrent la semaine en cours. */
function VersSemaineCourante({ vue }: { vue: 'courses' | 'session' }) {
  const { plan } = usePlanActif();
  if (plan === undefined) return <EnChargement />;
  if (plan === null) return <AucunPlan />;
  return <Navigate replace to={`/semaine/${semaineCourante(plan).numero}/${vue}`} />;
}

/** Fournit le plan et la semaine demandée aux écrans de semaine. */
function AvecSemaine({ vue }: { vue: 'repas' | 'courses' | 'session' | 'cuisine' }) {
  const { n } = useParams();
  const { plan } = usePlanActif();
  if (plan === undefined) return <EnChargement />;
  if (plan === null) return <AucunPlan />;
  const semaine = plan.semaines.find((s) => s.numero === Number(n));
  if (!semaine) return <Navigate replace to="/" />;
  if (vue === 'repas') return <SemaineRepas plan={plan} semaine={semaine} />;
  if (vue === 'courses') return <Courses plan={plan} semaine={semaine} />;
  if (vue === 'session') return <Session plan={plan} semaine={semaine} />;
  return <Cuisine plan={plan} semaine={semaine} />;
}

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/semaine/:n/cuisine" element={<AvecSemaine vue="cuisine" />} />
        <Route element={<Layout />}>
          <Route index element={<Accueil />} />
          <Route path="importer" element={<Importer />} />
          <Route path="courses" element={<VersSemaineCourante vue="courses" />} />
          <Route path="session" element={<VersSemaineCourante vue="session" />} />
          <Route path="placard" element={<Placard />} />
          <Route path="semaine/:n" element={<AvecSemaine vue="repas" />} />
          <Route path="semaine/:n/courses" element={<AvecSemaine vue="courses" />} />
          <Route path="semaine/:n/session" element={<AvecSemaine vue="session" />} />
          <Route path="recettes" element={<Bibliotheque />} />
          <Route path="recettes/:id" element={<FicheRecette />} />
          <Route path="reglages" element={<Reglages />} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
