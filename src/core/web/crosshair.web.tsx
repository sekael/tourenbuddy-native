import { classes } from './classes';
import styles from './crosshair.module.css';

const c = classes(styles);

/**
 * The centred crosshair: the geometry painted twice, a white halo then the mark, so it stays
 * legible over glacier, snow, rock and forest alike.
 */
export function Crosshair() {
  return (
    <div className={c('crosshair-wrapper')} aria-hidden="true">
      <svg className={c('crosshair')} viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <g id="crosshair-geometry">
            <line x1="3" y1="20" x2="16" y2="20" strokeLinecap="round" />
            <line x1="24" y1="20" x2="37" y2="20" strokeLinecap="round" />
            <line x1="20" y1="3" x2="20" y2="16" strokeLinecap="round" />
            <line x1="20" y1="24" x2="20" y2="37" strokeLinecap="round" />
            <circle cx="20" cy="20" r="2.5" />
          </g>
        </defs>
        <use href="#crosshair-geometry" stroke="#fff" fill="#fff" strokeWidth="5" />
        <use
          href="#crosshair-geometry"
          stroke="currentColor"
          fill="currentColor"
          strokeWidth="2.5"
        />
      </svg>
    </div>
  );
}
