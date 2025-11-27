let globalState = {
    mtxIndexOfSelectedPayment: 0,
  };
  
  export const setGlobalState = (key: keyof typeof globalState, value: any) => {
    globalState[key] = value;
  };
  
  export const getGlobalState = (key: keyof typeof globalState) => {
    return globalState[key];
  };
  