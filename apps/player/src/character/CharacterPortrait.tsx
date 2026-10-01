import { appearanceCatalog, type AppearanceChoice } from '@hunter-world/contracts';
import styles from './Character.module.css';

const tones = ['#f2d8bd', '#dfb792', '#bf8c68', '#9f6549', '#754a39', '#51362c'] as const;
const hairColors = ['#171b20', '#503628', '#a45a3e', '#d8af67', '#b7bac0'] as const;
const coats = ['#2f5858', '#554a65', '#36536c', '#645745'] as const;
const faceGeometries = [
  {
    path: 'M58 57 C58 29 71 21 90 21 C109 21 122 29 122 57 L120 110 C117 139 103 157 90 157 C77 157 63 139 60 110Z',
    earLeft: 57,
    earRight: 123,
    eyeLeft: 76,
    eyeRight: 104,
    eyeY: 96,
    mouthY: 132,
  },
  {
    path: 'M63 54 C64 24 74 17 90 17 C106 17 116 24 117 54 L116 119 C113 151 100 171 90 171 C80 171 67 151 64 119Z',
    earLeft: 62,
    earRight: 118,
    eyeLeft: 78,
    eyeRight: 102,
    eyeY: 98,
    mouthY: 139,
  },
  {
    path: 'M49 60 C49 29 65 21 90 21 C115 21 131 29 131 60 L127 108 C124 138 106 153 90 153 C74 153 56 138 53 108Z',
    earLeft: 48,
    earRight: 132,
    eyeLeft: 72,
    eyeRight: 108,
    eyeY: 96,
    mouthY: 130,
  },
  {
    path: 'M55 56 C57 27 70 19 90 19 C110 19 123 27 125 56 L120 108 C116 135 100 160 90 166 C80 160 64 135 60 108Z',
    earLeft: 57,
    earRight: 123,
    eyeLeft: 76,
    eyeRight: 104,
    eyeY: 94,
    mouthY: 132,
  },
] as const;

function labelFor<T extends readonly { id: string; label: string }[]>(
  values: T,
  id: string,
  fallback: string,
) {
  return values.find((value) => value.id === id)?.label ?? fallback;
}

export function appearanceDescription(appearance: AppearanceChoice) {
  const [face, coat] = labelFor(
    appearanceCatalog.presets,
    appearance.presetId,
    'Oval face, teal jacket',
  ).split(', ');
  const tone = labelFor(appearanceCatalog.skinTones, appearance.skinToneId, 'Light beige');
  const hairStyle = labelFor(
    appearanceCatalog.hairStyles,
    appearance.hairStyleId,
    'Cropped hair',
  ).replace(/ hair$/u, '');
  const hairColor = labelFor(
    appearanceCatalog.hairColors,
    appearance.hairColorId,
    'Black hair',
  ).replace(/ hair$/u, '');
  return `${face}, ${tone.toLowerCase()} skin, ${hairStyle.toLowerCase()} ${hairColor.toLowerCase()} hair, ${coat}.`;
}

function Hair({ style, color }: { style: AppearanceChoice['hairStyleId']; color: string }) {
  if (style === 'shaved') {
    return (
      <g>
        <path
          d="M58 61 C62 31 118 30 122 61 L121 70 C104 59 78 59 59 71Z"
          fill={color}
          opacity=".45"
        />
        <path d="M64 55 Q90 39 116 55" fill="none" stroke="#ffffff" strokeOpacity=".12" />
      </g>
    );
  }
  if (style === 'swept') {
    return (
      <g fill={color}>
        <path d="M56 69 C58 29 84 14 111 25 C125 31 131 43 126 67 C111 52 94 48 71 72Z" />
        <path d="M72 43 C91 27 111 30 121 44 C101 38 87 46 68 62Z" fill="#ffffff" opacity=".1" />
      </g>
    );
  }
  if (style === 'curly') {
    return (
      <g fill={color}>
        <path d="M53 67 C50 48 59 29 75 29 C81 17 100 17 106 28 C121 25 132 43 125 56 C135 67 124 78 116 76 C103 61 76 61 62 77 C54 78 48 73 53 67Z" />
        <circle cx="66" cy="42" r="8" fill="#ffffff" opacity=".09" />
        <circle cx="88" cy="31" r="7" fill="#ffffff" opacity=".07" />
      </g>
    );
  }
  if (style === 'coiled') {
    return (
      <g fill={color}>
        <path d="M50 68 C45 53 52 38 64 34 C67 19 83 18 91 26 C101 15 119 23 120 37 C134 42 136 58 126 69 L118 78 C108 59 72 59 61 79Z" />
        <circle cx="61" cy="47" r="10" />
        <circle cx="79" cy="34" r="11" />
        <circle cx="101" cy="33" r="11" />
        <circle cx="120" cy="49" r="10" />
        <path
          d="M58 49 Q89 22 121 48"
          fill="none"
          stroke="#ffffff"
          strokeOpacity=".1"
          strokeWidth="3"
        />
      </g>
    );
  }
  return (
    <g fill={color}>
      <path d="M57 69 C59 32 75 24 91 24 C110 24 123 35 123 66 L119 76 C102 62 77 61 60 77Z" />
      <path
        d="M67 48 Q91 31 115 48"
        fill="none"
        stroke="#ffffff"
        strokeOpacity=".11"
        strokeWidth="3"
      />
    </g>
  );
}

export function CharacterPortrait({
  appearance,
  compact = false,
  miniature = false,
  decorative = false,
}: {
  appearance: AppearanceChoice;
  compact?: boolean;
  miniature?: boolean;
  decorative?: boolean;
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
  const skin = tones[toneIndex] ?? tones[0];
  const hairColor = hairColors[hairIndex] ?? hairColors[0];
  const coat = coats[presetIndex] ?? coats[0];
  const face = faceGeometries[presetIndex] ?? faceGeometries[0];
  const description = appearanceDescription(appearance);
  return (
    <svg
      className={
        miniature ? styles.portraitMiniature : compact ? styles.portraitCompact : styles.portrait
      }
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': description })}
      viewBox="0 0 180 220"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="180" height="220" rx="12" fill="#0b1821" />
      <path
        d="M20 49 H160 M20 91 H160 M20 133 H160 M48 18 V166 M90 18 V166 M132 18 V166"
        stroke="#87c3aa"
        strokeOpacity=".07"
      />
      <circle cx="90" cy="88" r="70" fill="#173437" />
      <circle cx="90" cy="82" r="55" fill="#87c3aa" opacity=".055" />
      <path d="M12 220 C18 179 44 166 69 161 H111 C136 166 162 179 168 220Z" fill={coat} />
      <path d="M55 175 L72 157 L90 181 L108 157 L125 175 L134 220 H46Z" fill="#17232b" />
      <path
        d="M69 162 L90 181 L76 194 L57 174Z M111 162 L90 181 L104 194 L123 174Z"
        fill={coat}
        stroke="#87c3aa"
        strokeOpacity=".22"
      />
      <path d="M84 181 H96 L99 220 H81Z" fill="#d7e3dd" opacity=".72" />
      <path d="M75 145 L75 166 Q90 180 105 166 L105 145Z" fill={skin} />
      <ellipse cx={face.earLeft} cy="95" rx="9" ry="15" fill={skin} />
      <ellipse cx={face.earRight} cy="95" rx="9" ry="15" fill={skin} />
      <path d={face.path} fill={skin} />
      <path
        d="M62 111 Q68 143 90 153 Q112 143 119 111 Q111 150 90 160 Q68 149 62 111Z"
        fill="#3b1d19"
        opacity=".08"
      />
      <Hair style={appearance.hairStyleId} color={hairColor} />
      <path
        d={`M${face.eyeLeft - 9} ${face.eyeY - 10} Q${face.eyeLeft} ${face.eyeY - 15} ${face.eyeLeft + 8} ${face.eyeY - 11} M${face.eyeRight - 8} ${face.eyeY - 11} Q${face.eyeRight} ${face.eyeY - 15} ${face.eyeRight + 9} ${face.eyeY - 10}`}
        fill="none"
        stroke="#25282a"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <g fill="#f7f3ea">
        <ellipse cx={face.eyeLeft} cy={face.eyeY} rx="7" ry="4" />
        <ellipse cx={face.eyeRight} cy={face.eyeY} rx="7" ry="4" />
      </g>
      <g fill="#304d49">
        <circle cx={face.eyeLeft + 1} cy={face.eyeY} r="2.8" />
        <circle cx={face.eyeRight - 1} cy={face.eyeY} r="2.8" />
      </g>
      <path
        d={`M90 ${face.eyeY + 3} L87 ${face.mouthY - 16} Q90 ${face.mouthY - 13} 94 ${face.mouthY - 16}`}
        fill="none"
        stroke="#68483f"
        strokeOpacity=".65"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d={`M79 ${face.mouthY} Q90 ${face.mouthY + 6} 101 ${face.mouthY - 1} Q91 ${face.mouthY + 13} 79 ${face.mouthY}Z`}
        fill="#825146"
        opacity=".9"
      />
      <path d="M24 205 H58 M122 205 H156" stroke="#87c3aa" strokeOpacity=".55" strokeWidth="2" />
      <circle cx="90" cy="204" r="3" fill="#87c3aa" />
    </svg>
  );
}
