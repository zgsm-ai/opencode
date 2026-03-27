import { ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => {
   return (
      <svg
         data-component="logo-mark"
         classList={{ [props.class ?? ""]: !!props.class }}
         viewBox="0 0 17.00048828125 20.10400390625"
         fill="none"
         xmlns="http://www.w3.org/2000/svg"
      >
         <g>
            <g transform="matrix(-1,0,0,1,34.0009765625,0)">
               <g transform="matrix(-1,0,0,1,64.0009765625,0)">
                  <path
                     data-slot="logo-logo-mark-shadow"
                     d="M32.00048828125 19L32.00048828125 19.75L32.00048828125 20L33.00048828125 20L36.00048828125 20L36.00048828125 18L36.00048828125 16L35.00048828125 16L35.00048828125 17L34.00048828125 17L34.00048828125 18L33.00048828125 18L33.00048828125 19L32.00048828125 19Z"
                     fill="var(--icon-weak-base)"
                     style={{ "mix-blend-mode": "normal" }}
                  />
               </g>
               <g>
                  <path
                     data-slot="logo-logo-mark-main"
                     d="M17.00048828125 20L27.33398828125 20L27.33378828125 16L21.00048828125 16L21.00048828125 4L28.00048828125 4L28.00048828125 9.5L32.00048828125 9.5L32.00048828125 0L17.00048828125 0L17.00048828125 20Z"
                     fill="var(--icon-strong-base)"
                     style={{ "mix-blend-mode": "normal" }}
                  />
               </g>
            </g>

            <g transform="matrix(-0.4571363925933838,-0.889396607875824,-0.889396607875824,0.4571363925933838,21.04827984276926,12.84730013657827)">
               <rect
                  data-slot="logo-detail-1"
                  x="4.869140625"
                  y="15.6884765625"
                  width="2.1982638835906982"
                  height="2.1982288360595703"
                  rx="0"
                  fill="var(--icon-strong-base)"
               />
            </g>

            <g transform="matrix(-0.006367747206240892,-0.9998950958251953,-0.9998950958251953,0.006367747206240892,21.61457869294236,21.477876850825396)">
               <rect
                  data-slot="logo-detail-2"
                  x="7.7919921875"
                  y="13.7744140625"
                  width="2.7744698524475098"
                  height="2.7738444805145264"
                  rx="0"
                  fill="var(--icon-strong-base)"
               />
            </g>

            <g transform="matrix(0.9698702692985535,-0.2436625063419342,-0.2436625063419342,-0.9698702692985535,4.475165223571821,36.17922033238574)">
               <rect
                  data-slot="logo-detail-3"
                  x="1.244140625"
                  y="18.21240234375"
                  width="0.9951171875"
                  height="1"
                  rx="0"
                  fill="var(--icon-strong-base)"
               />
            </g>

            <g transform="matrix(0.9174888134002686,0.39776182174682617,0.39776182174682617,-0.9174888134002686,-7.86356476508081,37.90785501804203)">
               <rect
                  data-slot="logo-detail-4"
                  x="0"
                  y="19.76953125"
                  width="0.8406413793563843"
                  height="0.8394737839698792"
                  rx="0"
                  fill="var(--icon-strong-base)"
               />
            </g>
         </g>
      </svg>
   )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
   return (
      <svg
         ref={props.ref}
         data-component="logo-splash"
         classList={{ [props.class ?? ""]: !!props.class }}
         viewBox="0 0 80 100"
         fill="none"
         xmlns="http://www.w3.org/2000/svg"
      >
         <path d="M60 80H20V40H60V80Z" fill="var(--icon-base)" />
         <path d="M60 20H20V80H60V20ZM80 100H0V0H80V100Z" fill="var(--icon-strong-base)" />
      </svg>
   )
}

export const Logo = (props: { class?: string }) => {
   return (
      <svg
         xmlns="http://www.w3.org/2000/svg"
         viewBox="0 0 234 42"
         fill="none"
         classList={{ [props.class ?? ""]: !!props.class }}
      >
         <g>
            <path d="M13 32H4V23H13V32Z" fill="var(--icon-weak-base)" />
            <path d="M24 12H6V30H24V36H0V6H24V12Z" fill="var(--icon-strong-base)" />

            <path d="M42 20H34V12H42V20Z" fill="var(--icon-weak-base)" />
            <path d="M48 12H36V30H48V12ZM54 36H30V6H54V36Z" fill="var(--icon-strong-base)" />

            <g transform="matrix(0.6767613887786865 0.7362024188041687 -0.7362024188041687 0.6767613887786865 28.70721722964663 -47.38303970740526)">
               <path d="M71.6612 16.2167H68.313V9H71.6612V16.2167Z" fill="var(--icon-weak-base)" />
            </g>
            <path d="M75 33H63V27H75V33Z" fill="var(--icon-weak-base)" />
            <path d="M84 12H66V18H84V24H80V30H84V36H60V30H84V24H60V6H84V12Z" fill="var(--icon-strong-base)" />

            <path d="M108 30H96V12H108V30Z" fill="var(--icon-weak-base)" />
            <path d="M114 12H108V36H96V12H90V6H114V12Z" fill="var(--icon-strong-base)" />

            <path d="M138 24H126V18H138V24Z" fill="var(--icon-weak-base)" />
            <path d="M138 36H132V30H138V36Z" fill="var(--icon-weak-base)" />
            <path
               d="M132 24V30H138L132 24ZM120 36H126V30V12H138V20H144V12V6H120V36ZM138 36H144L138 30V36Z"
               fill="var(--icon-strong-base)"
            />
            <rect x="126" y="18" width="18" height="6" fill="var(--icon-strong-base)" />

            <path
               d="M156 6V9.59752V13.2168L165 13.2173V10.3648V8.54591V6H156ZM156 36.0002H168V14.8013H156V36.0002Z"
               fill="var(--icon-strong-base)"
            />
            <path d="M167 9H163V5H167V9Z" fill="var(--icon-weak-base)" />
            <path d="M168 12H166V10H168V12Z" fill="var(--icon-weak-base)" />
            <path d="M170 9H168V7H170V9Z" fill="var(--icon-weak-base)" />

            <path d="M194 16H182V12H194V16Z" fill="var(--icon-weak-base)" />
            <path d="M204 12H186V30H204V36H180V6H204V12Z" fill="var(--icon-strong-base)" />

            <path d="M228 30H216V12H228V30Z" fill="var(--icon-weak-base)" />
            <path d="M234 12H228V36H216V12H210V6H234V12Z" fill="var(--icon-strong-base)" />
         </g>
      </svg>
   )
}
