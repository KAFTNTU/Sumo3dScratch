// Stub generator (web version).
// The original project may generate STM32 code; in this web-only build we keep an empty
// module so the app doesn't error with 404/MIME issues.
window.STM32_CGEN = window.STM32_CGEN || {
  generate(){
    return {
      files: [],
      warning: 'stm32_cgen.js stub: generator not included in this build.'
    };
  }
};
