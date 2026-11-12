import { SkillList } from "../components/SkillList";

export function HomePage({ onOpenSkill }: { onOpenSkill: (id: string) => void }) {
  return (
    <div>
      <p className="muted">Pilih Kemahiran AI untuk menganalisis data kewangan Akaun Simple anda. Sheet asal anda tidak akan diubah.</p>
      <SkillList onOpen={onOpenSkill} />
    </div>
  );
}
