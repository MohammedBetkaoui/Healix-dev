import type { AiPipelineId } from "@/features/ai-analyses/ai-analyses.types";

type HealixSpecialtyArtworkProps = {
  pipeline: AiPipelineId;
  className?: string;
};

/** Decorative clinical atlas drawings, deliberately independent of patient results. */
export function HealixSpecialtyArtwork({ pipeline, className }: HealixSpecialtyArtworkProps) {
  return (
    <svg
      viewBox="0 0 240 160"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <g opacity="0.24" strokeWidth="0.8">
        <path d="M23 32V21h11M206 21h11v11M217 128v11h-11M34 139H23v-11" />
        <path d="M115 14h10M120 9v10M115 146h10M120 141v10" />
      </g>

      {pipeline === "brain" && (
        <g>
          <path
            d="M116 24c-13-8-31-3-41 10-13 3-22 17-21 30-9 12-9 31 1 41 1 15 12 27 26 29 11 9 27 7 35-3 3-5 4-12 4-20V44c0-8-1-15-4-20Z"
            fill="currentColor"
            fillOpacity="0.035"
          />
          <path
            d="M124 24c13-8 31-3 41 10 13 3 22 17 21 30 9 12 9 31-1 41-1 15-12 27-26 29-11 9-27 7-35-3-3-5-4-12-4-20V44c0-8 1-15 4-20Z"
            fill="currentColor"
            fillOpacity="0.035"
          />
          <g opacity="0.68">
            <path d="M104 31c-11-1-20 8-19 18-13-1-23 8-21 21-8 9-7 21 1 27-1 13 7 23 19 23 6 9 17 11 23 4" />
            <path d="M136 31c11-1 20 8 19 18 13-1 23 8 21 21 8 9 7 21-1 27 1 13-7 23-19 23-6 9-17 11-23 4" />
            <path d="M108 45c-9-4-17 1-17 9 0 8-7 11-14 9M132 45c9-4 17 1 17 9 0 8 7 11 14 9" />
            <path d="M76 80c8-7 16-4 18 5 2 8-2 14-9 16M164 80c-8-7-16-4-18 5-2 8 2 14 9 16" />
            <path d="M69 105c7-5 14-1 16 5M171 105c-7-5-14-1-16 5" />
            <path d="M104 113c-9-3-10-11-5-17M136 113c9-3 10-11 5-17" />
          </g>
          <path d="M113 65c-11-5-16 2-10 11l10 13V65ZM127 65c11-5 16 2 10 11l-10 13V65Z" fill="currentColor" fillOpacity="0.1" />
          <path d="M109 55c4-3 7-3 11-2 4-1 7-1 11 2M112 101c5 3 11 3 16 0" opacity="0.48" />
          <path d="M39 80h9M192 80h9" opacity="0.25" strokeWidth="0.8" />
        </g>
      )}

      {pipeline === "cardio-ecg" && (
        <g>
          <g opacity="0.12" strokeWidth="0.65">
            {[40, 56, 72, 88, 104, 120, 136, 152, 168, 184, 200].map((x) => (
              <path key={x} d={`M${x} 32v96`} />
            ))}
            {[32, 48, 64, 80, 96, 112, 128].map((y) => (
              <path key={y} d={`M40 ${y}h160`} />
            ))}
          </g>
          <g opacity="0.3" strokeWidth="0.8">
            <path d="M40 32h160v96H40Z" />
            <path d="M32 48h4M32 80h4M32 112h4M204 48h4M204 80h4M204 112h4" />
          </g>
          <path d="M40 51h16c4 0 4-5 8-5s4 5 8 5h7l4 5 5-26 5 35 5-14h14c6 0 6-8 12-8s7 8 13 8h14c4 0 4-5 8-5s4 5 8 5h6l4 5 5-26 5 35 5-14h8" />
          <path d="M40 83h16c4 0 4-4 8-4s4 4 8 4h7l4 4 5-22 5 32 5-14h14c6 0 6-7 12-7s7 7 13 7h14c4 0 4-4 8-4s4 4 8 4h6l4 4 5-22 5 32 5-14h8" opacity="0.8" />
          <path d="M40 115h16c4 0 4-3 8-3s4 3 8 3h7l4 3 5-18 5 25 5-10h14c6 0 6-6 12-6s7 6 13 6h14c4 0 4-3 8-3s4 3 8 3h6l4 3 5-18 5 25 5-10h8" opacity="0.55" />
        </g>
      )}

      {pipeline === "cardio-seg-mri" && (
        <g>
          {/* Transverse thorax and soft-tissue landmarks of a cine-MRI slice. */}
          <path
            d="M43 79c0-31 31-52 77-52s77 21 77 52c0 33-30 55-77 55S43 112 43 79Z"
            fill="currentColor"
            fillOpacity="0.025"
            strokeOpacity="0.2"
            strokeWidth="0.8"
          />
          <path d="M54 75c2-21 17-35 38-39-13 11-19 26-17 43 1 15 7 28 18 40-22-4-38-20-39-44ZM186 75c-2-21-17-35-38-39 13 11 19 26 17 43-1 15-7 28-18 40 22-4 38-20 39-44Z" fill="currentColor" fillOpacity="0.035" stroke="none" />
          <path d="M82 53c11-14 29-20 47-16 19 4 34 17 40 35 6 19-1 40-17 51-17 11-39 11-56 1-16-10-25-28-22-46 1-9 4-18 8-25Z" fill="currentColor" fillOpacity="0.055" strokeOpacity="0.18" strokeWidth="0.75" />

          {/* Right ventricle: the thinner crescent wrapping the anterior LV wall. */}
          <path
            d="M122 49c15-7 34-3 44 9 11 13 12 30 4 43-6 9-15 15-27 17 7-7 11-15 12-24 2-15-4-29-15-38-5-4-11-6-18-7Z"
            fill="#0072B2"
            fillOpacity="0.17"
            stroke="#0072B2"
            strokeOpacity="0.82"
            strokeWidth="1.35"
          />
          <path d="M143 61c10 7 16 18 15 30-1 8-4 15-9 21 11-4 18-10 21-19 4-11 0-23-8-30-5-5-12-7-19-7" stroke="#0072B2" strokeOpacity="0.4" strokeWidth="0.75" />

          {/* LV myocardium, rendered as an irregular muscular ring. */}
          <path
            d="M88 59c11-12 29-16 44-9 16 7 26 23 25 39-1 17-12 32-28 38-16 6-35 1-45-12-11-13-13-31-6-46 2-4 5-7 10-10Zm13 14c-7 7-8 19-3 28 5 9 16 14 26 11 11-3 18-12 18-23 0-10-6-20-16-24-9-4-19-1-25 8Z"
            fill="#009E73"
            fillOpacity="0.17"
            fillRule="evenodd"
            clipRule="evenodd"
            stroke="#009E73"
            strokeOpacity="0.82"
            strokeWidth="1.4"
          />

          {/* LV blood pool and papillary muscles. */}
          <path
            d="M102 73c6-8 16-11 25-7 10 4 16 13 15 24 0 10-7 19-17 22-10 3-21-2-26-11-5-9-4-21 3-28Z"
            fill="#D55E00"
            fillOpacity="0.18"
            stroke="#D55E00"
            strokeOpacity="0.86"
            strokeWidth="1.35"
          />
          <path d="M112 86c3-3 7-2 8 2 1 3-2 6-5 6-4 0-6-5-3-8ZM126 96c3-2 7 0 7 4 0 3-3 5-6 4-4-1-5-6-1-8Z" fill="currentColor" fillOpacity="0.2" stroke="none" />

          {/* Septum, surrounding fat and posterior vertebra. */}
          <g opacity="0.32" strokeWidth="0.75">
            <path d="M141 61c5 8 8 17 7 27-1 12-6 22-15 29" />
            <path d="M77 68c-5 14-3 30 6 42M168 51c10 8 16 19 18 31" />
          </g>
          <ellipse cx="119" cy="126" rx="9" ry="6" fill="currentColor" fillOpacity="0.07" strokeOpacity="0.2" strokeWidth="0.7" />
          <circle cx="119" cy="126" r="2.2" fill="currentColor" fillOpacity="0.16" stroke="none" />
        </g>
      )}

      {pipeline === "pathology-breast" && (
        <g>
          <path d="M39 54c10-20 23-22 36-14 9 5 17 4 28-4 16-12 31-11 45 1 9 8 18 11 29 9 16-3 27 5 28 19 1 12-9 20-7 31 3 15-6 26-21 27-15 1-22 13-39 10-12-2-17-11-29-11-15 1-22 12-38 5-12-5-9-18-20-26-17-12-24-30-12-47Z" fill="currentColor" fillOpacity="0.035" />
          <g opacity="0.65">
            <path d="M48 57c8-12 18-12 29-6 13 7 25 2 35-5 11-8 21-7 31 2 11 10 22 13 35 10 10-2 18 3 17 12-1 11-11 19-8 29 2 11-6 15-18 16-11 1-20 13-32 8-11-5-18-12-31-10-14 2-22 12-32 4-7-5-6-16-15-23-13-10-19-23-11-37Z" />
            <path d="M58 71c5-9 17-9 25-2 6 6 6 16-2 22-8 6-20 2-25-5-3-5-1-11 2-15Z" />
            <path d="M108 59c9-7 23-3 28 7 5 10 0 21-10 24-11 3-21-3-23-13-2-7 0-13 5-18Z" />
            <path d="M151 77c9-7 20-3 24 6 4 9-1 18-10 21-9 2-18-2-21-11-2-6 1-12 7-16Z" />
            <path d="M101 99c7-5 15-4 21 2M84 43c9 2 16 0 22-6M136 111c7 4 15 4 21 0" />
          </g>
          <g fill="currentColor" fillOpacity="0.06">
            <path d="M65 73c4-4 11-3 14 2 3 6-1 12-7 12-7 0-11-8-7-14Z" />
            <path d="M113 66c5-4 12-2 15 3 4 7-1 14-8 14s-12-11-7-17Z" />
            <path d="M153 84c4-4 11-2 14 3 3 6-1 12-7 12s-11-9-7-15Z" />
          </g>
          <g strokeWidth="1.9" opacity="0.45">
            <path d="m54 62 2-2m32 3 2 2m2 23 1 2m-24 9 2 1m28-42 1-2m40 9 1 2m-5 30 1 1m15-36 2 1m30 16 1 2m-40 34 2 1m-38 4 2-1m-47-10 1 1m100-8 2-1" />
          </g>
        </g>
      )}

      {pipeline === "pathology-nuclei" && (
        <g>
          <g fill="currentColor" fillOpacity="0.035">
            <path d="M77 28c16-4 31 6 32 21 2 16-9 29-24 30-17 1-28-11-27-26 0-12 7-22 19-25Z" />
            <path d="M135 23c16-3 29 8 29 23 0 16-13 29-27 27-16-1-25-13-24-27 1-12 9-21 22-23Z" />
            <path d="M173 66c15-3 29 6 29 21 1 15-10 28-25 28-16 0-28-12-27-26 0-11 10-21 23-23Z" />
            <path d="M119 78c15-2 27 7 28 22 1 15-11 28-26 28s-28-10-28-25c0-14 12-24 26-25Z" />
            <path d="M58 86c13-4 27 5 29 19 2 15-8 27-22 29-14 1-27-8-28-22-2-12 8-22 21-26Z" />
          </g>
          <g opacity="0.55" strokeWidth="0.9">
            <path d="M83 35c13-1 20 9 18 21-1 11-11 18-21 15-11-3-17-13-13-23 3-7 9-12 16-13Z" />
            <path d="M136 31c12-2 22 9 20 20-2 11-12 16-22 13-10-2-16-11-13-20 2-7 8-12 15-13Z" />
            <path d="M176 74c12-1 21 7 19 18-2 11-12 18-22 15-11-2-17-11-14-21 2-6 9-11 17-12Z" />
            <path d="M119 86c11-2 22 6 21 17-1 12-10 20-21 18-12-1-20-10-18-20 1-7 9-14 18-15Z" />
            <path d="M59 94c10-2 20 5 21 16 1 10-7 18-17 17-10 0-19-7-18-17 1-7 7-14 14-16Z" />
          </g>
          <g fill="currentColor" fillOpacity="0.13">
            <ellipse cx="84" cy="53" rx="10" ry="12" transform="rotate(22 84 53)" />
            <ellipse cx="137" cy="48" rx="10" ry="11" transform="rotate(-27 137 48)" />
            <ellipse cx="177" cy="90" rx="11" ry="9" transform="rotate(-20 177 90)" />
            <ellipse cx="120" cy="103" rx="11" ry="10" transform="rotate(28 120 103)" />
            <ellipse cx="63" cy="110" rx="9" ry="10" transform="rotate(-15 63 110)" />
          </g>
          <g fill="currentColor" stroke="none" opacity="0.55">
            <circle cx="82" cy="51" r="1.6" />
            <circle cx="139" cy="48" r="1.6" />
            <circle cx="176" cy="89" r="1.6" />
            <circle cx="119" cy="104" r="1.6" />
            <circle cx="64" cy="109" r="1.6" />
          </g>
        </g>
      )}
    </svg>
  );
}
