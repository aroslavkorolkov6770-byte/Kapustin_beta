import Image from 'next/image';

type VatesLogoProps = {
  className?: string;
  priority?: boolean;
  variant?: 'full' | 'symbol';
};

export default function VatesLogo({ className = '', priority = false, variant = 'full' }: VatesLogoProps) {
  if (variant === 'symbol') {
    return (
      <span className={`vates-logo-symbol ${className}`.trim()} role="img" aria-label="Ватэс">
        <Image
          src="/vates-logo-transparent.png"
          alt=""
          width={1680}
          height={498}
          className="vates-logo-symbol-image"
          priority={priority}
        />
      </span>
    );
  }

  return (
    <Image
      src="/vates-logo-transparent.png"
      alt="Ватэс"
      width={1680}
      height={498}
      className={className}
      priority={priority}
    />
  );
}
