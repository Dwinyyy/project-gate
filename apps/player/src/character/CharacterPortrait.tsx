import { appearanceCatalog, type AppearanceChoice } from '@hunter-world/contracts';
import styles from './Character.module.css';

const tones = ['#f2d8bd', '#dfb792', '#bf8c68', '#9f6549', '#754a39', '#51362c'] as const;
const hairColors = ['#171b20', '#503628', '#a45a3e', '#d8af67', '#b7bac0'] as const;
const coats = ['#2f5858', '#554a65', '#36536c', '#645745'] as const;

export function CharacterPortrait({
  appearance,
  compact = false,
}: {
  appearance: AppearanceChoice;
  compact?: boolean;
}) {
  const presetIndex = appearanceCatalog.presets.findIndex(
    (value) => value.id === appearance.presetId,
  );
  const toneIndex = appearanceCatalog.skinTones.findIndex(
    (value) => value.id === appearance.skinToneId,
  );
  const hairIndex = appearanceCatalog.hairColors.findIndex(
    (value) => value.id === appearance.hairColorId,
  );
  const preset = appearanceCatalog.presets[presetIndex]?.label ?? 'Portrait';
  const tone = appearanceCatalog.skinTones[toneIndex]?.label ?? 'Skin tone';
  const hair =
    appearanceCatalog.hairStyles.find((value) => value.id === appearance.hairStyleId)?.label ??
    'Hair';
  const color = appearanceCatalog.hairColors[hairIndex]?.label ?? 'Hair color';
  const face =
    appearance.presetId === 'portrait-02'
      ? 'M57 56 C58 28 122 28 123 56 L121 112 C118 143 101 158 90 158 C76 158 62 141 59 112Z'
      : appearance.presetId === 'portrait-03'
        ? 'M55 57 C55 25 125 25 125 57 L121 111 C118 143 103 156 90 156 C77 156 62 143 59 111Z'
        : appearance.presetId === 'portrait-04'
          ? 'M59 54 C62 26 119 26 122 54 L120 111 C115 142 102 154 90 154 C78 154 65 142 60 111Z'
          : 'M58 56 C58 27 122 27 122 56 L120 111 C116 142 101 155 90 155 C79 155 64 142 60 111Z';
  const hairColor = hairColors[hairIndex] ?? hairColors[0];
  return (
    <svg
      className={compact ? styles.portraitCompact : styles.portrait}
      role="img"
      aria-label={`${preset}, ${tone}, ${hair.toLowerCase()}, ${color.toLowerCase()}`}
      viewBox="0 0 180 220"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="180" height="220" rx="12" fill="#10202a" />
      <circle cx="90" cy="91" r="75" fill="#183739" />
      <path
        d="M16 220 C22 177 48 167 68 164 L112 164 C136 167 158 183 164 220Z"
        fill={coats[presetIndex] ?? coats[0]}
      />
      <path d="M75 147 L75 174 Q90 189 105 174 L105 147Z" fill={tones[toneIndex] ?? tones[0]} />
      <path d={face} fill={tones[toneIndex] ?? tones[0]} />
      {appearance.hairStyleId !== 'shaved' ? (
        <path
          d="M58 68 C62 30 117 24 123 65 L123 79 C108 72 101 58 95 51 C85 68 72 73 58 76Z"
          fill={hairColor}
        />
      ) : null}
      {appearance.hairStyleId === 'swept' ? (
        <path
          d="M57 64 C69 20 127 30 131 58 C117 50 101 56 82 68 C73 75 65 78 56 78Z"
          fill={hairColor}
        />
      ) : null}
      {appearance.hairStyleId === 'curly' || appearance.hairStyleId === 'coiled' ? (
        <g fill={hairColor}>
          {[54, 66, 78, 90, 102, 114, 126].map((x, index) => (
            <circle
              key={x}
              cx={x}
              cy={index % 2 ? 43 : 48}
              r={appearance.hairStyleId === 'coiled' ? 13 : 11}
            />
          ))}
          <circle cx="54" cy="64" r="11" />
          <circle cx="126" cy="64" r="11" />
        </g>
      ) : null}
      {appearance.hairStyleId === 'shaved' ? (
        <path
          d="M58 62 C62 32 119 32 122 62 L122 71 C103 57 80 59 58 72Z"
          fill={hairColor}
          opacity=".22"
        />
      ) : null}
      <path d="M70 93 h12 M98 93 h12" stroke="#243039" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M82 125 Q90 130 98 125"
        fill="none"
        stroke="#784e42"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M18 202 H162" stroke="#87c3aa" strokeOpacity=".35" />
    </svg>
  );
}
