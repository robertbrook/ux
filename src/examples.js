export const examples = [
  {
    name: 'Interference', file: 'interference.tal', category: 'Screen', description: 'A moving field of interference, drawn one pixel at a time.',
    source: `( Interference — a small study in binary texture )
( Run. Change the palette or the AND mask. )

|00 @x $2 @y $2 @time $1

|0100
  ( 128 × 128 display )
  #0080 #22 DEO2
  #0080 #24 DEO2
  ( four-color palette: midnight, blue, paper, coral )
  #025f #08 DEO2
  #0479 #0a DEO2
  #0896 #0c DEO2
  ;on-frame #20 DEO2
BRK

@on-frame ( -- )
  .time LDZ INC .time STZ
  #0000 .y STZ2
  &row
    #0000 .x STZ2
    &pixel
      .x LDZ2 #28 DEO2
      .y LDZ2 #2a DEO2
      ( color = ((x xor y) + time) >> 3 & 3 )
      .x LDZ2 .y LDZ2 EOR2
      NIP .time LDZ ADD #03 SFT #03 AND
      #2e DEO
      .x LDZ2 INC2 DUP2 .x STZ2
      #0080 LTH2 ?&pixel
    .y LDZ2 INC2 DUP2 .y STZ2
    #0080 LTH2 ?&row
BRK
`,
  },
  {
    name: 'Hello, world', file: 'hello.tal', category: 'Console', description: 'Start here: labels, a loop, and the console device.',
    source: `( Print a null-terminated string to Console/write. )
|0100
  ;message
  &loop
    LDAk #18 DEO
    INC2 LDAk ?&loop
  POP2
BRK

@message "Hello, 20 "Uxn 20 "world! 0a 00
`,
  },
  {
    name: 'Stack arithmetic', file: 'stack.tal', category: 'Debugger', description: 'Step through byte and short arithmetic. Watch both stacks.',
    source: `( Use Run options: Assemble only, then Debug: Step to watch the stack. )
|0100
  #03 #04 ADD
  DUP #02 MUL
  #0100 #002a ADD2
  STH2
  #41 #18 DEO
  #0a #18 DEO
BRK
`,
  },
  {
    name: 'Pixel brush', file: 'brush.tal', category: 'Mouse', description: 'Draw with the mouse. Left paints; right erases.',
    source: `( Click and drag inside the display. )
|0100
  #0100 #22 DEO2 #00c0 #24 DEO2
  #0f8f #08 DEO2 #0d6f #0a DEO2 #0b4f #0c DEO2
  ;on-mouse #90 DEO2
BRK

@on-mouse
  #92 DEI2 #28 DEO2
  #94 DEI2 #2a DEO2
  #96 DEI #01 AND ?&paint
  #96 DEI #04 AND ?&erase
BRK
  &paint #43 #2e DEO BRK
  &erase #40 #2e DEO BRK
`,
  },
  {
    name: 'Sprite atlas', file: 'sprites.tal', category: 'Sprites', description: 'One-bit sprites, foreground layers, flips, and auto-repeat.',
    source: `( A row of 8 × 8 sprites. )
|0100
  #0080 #22 DEO2 #0060 #24 DEO2
  #0f8f #08 DEO2 #0d6f #0a DEO2 #0b4f #0c DEO2
  #0020 #28 DEO2 #0020 #2a DEO2
  ;tile #2c DEO2
  #72 #26 DEO
  #43 #2f DEO
BRK

@tile 183c 7eff ff7e 3c18
`,
  },
  {
    name: 'Sample voice', file: 'audio.tal', category: 'Audio', description: 'Play a looping waveform with an ADSR envelope.',
    source: `( Enable sound, then Run. )
|0100
  #2484 #38 DEO2 ( attack / decay / sustain / release )
  #0020 #3a DEO2 ( sample length )
  ;wave #3c DEO2 ( sample address )
  #aa #3e DEO   ( left / right volume )
  #3c #3f DEO   ( middle C; high bit disables looping )
BRK

@wave
  808c 98a3 adb5 bbc0 c4c6 c7c6 c4c0 bbb5
  ada3 988c 8073 675c 524a 443f 3b39 3839
`,
  },
  {
    name: 'Virtual files', file: 'files.tal', category: 'Files', description: 'Write a text file into the browser-backed virtual disk.',
    source: `( Writes greeting.txt. Find it in Virtual disk. )
|0100
  ;filename #a8 DEO2
  #000f #aa DEO2
  ;message #ae DEO2
BRK

@filename "greeting.txt 00
@message "Made 20 "with 20 "Uxn. 0a
`,
  },
  {
    name: 'Keyboard echo', file: 'keyboard.tal', category: 'Controller', description: 'Focus the display and type. Each key is sent to the console.',
    source: `( Focus the display, then type. )
|0100
  ;on-key #80 DEO2
BRK

@on-key
  #83 DEI DUP ?&print
  POP BRK
  &print #18 DEO
BRK
`,
  },
];
