import { SKILLS } from "@akaun/shared";

export function SkillList({ onOpen }: { onOpen: (skillId: string) => void }) {
  return (
    <section className="card">
      <h2 className="section-title">Kemahiran AI</h2>
      <ul className="skills">
        {SKILLS.map((s) => {
          const enabled = s.status === "enabled";
          return (
            <li key={s.id}>
              <button className={`skill ${enabled ? "" : "skill-disabled"}`} disabled={!enabled} onClick={() => onOpen(s.id)}>
                <span className="skill-name">{s.nameMs}</span>
                <span className="skill-desc">{s.descriptionMs}</span>
                {!enabled && <span className="badge">Akan Datang</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
