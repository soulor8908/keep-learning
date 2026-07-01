// mount 执行抛异常的物料 fixture
export default {
  mount() {
    throw new Error('模拟物料内部崩溃');
  }
};
