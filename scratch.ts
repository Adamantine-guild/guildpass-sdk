class Real {
  public a: string = 'a';
  private b: string = 'b';
  public method(): void {}
}

type Public<T> = { [K in keyof T]: T[K] };

const mock: Public<Real> = {
  a: 'mock',
  method: () => {}
};
console.log(mock);
