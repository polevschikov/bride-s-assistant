type ArtProps = {
  className?: string;
  eager?: boolean;
};

function Art({ name, alt, className = '', eager = false }: ArtProps & { name: string; alt: string }) {
  return (
    <img
      className={className}
      src={`/illustrations/${name}.webp`}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : 'auto'}
      decoding="async"
    />
  );
}

export function PlanningIllustration({ small = false }: { small?: boolean }) {
  return small
    ? <Art name="plan-created" className="spot-art" alt="Пара раскладывает этапы персонального свадебного плана" />
    : <Art name="hero-planning" className="hero-art" alt="Пара разбирает свадебный план за домашним столом и передаёт задачу специалисту" eager />;
}

export function EmptyArt() {
  return <Art name="empty-state" className="empty-art" alt="Открытый чистый планер, карандаш и чашка чая" />;
}

export function QuizCompleteArt() {
  return <Art name="quiz-complete" className="success-art" alt="Пара спокойно завершает свадебный квиз" />;
}

export function DelegationArt() {
  return <Art name="delegation" className="delegation-art" alt="Невеста передаёт отдельную задачу специалисту" />;
}

export function OrderSuccessArt() {
  return <Art name="order-success" className="order-success-art" alt="Пара и специалист завершают оформление заказа" eager />;
}

export function PartnerArt() {
  return <Art name="partner-invite" className="partner-art" alt="Партнёры обмениваются приглашением к обсуждению плана" />;
}
