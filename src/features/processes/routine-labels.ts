/**
 * The seed data ships routine names in Chinese. Technicians in the export
 * markets need English labels, so every routine is mapped here.
 */
const ROUTINE_LABELS: Record<string, string> = {
  ADCU_通讯密钥申请: "ADCU communication key request",
  CCU_通讯密钥申请: "CCU communication key request",
  IDCU_通讯密钥申请: "IDCU communication key request",
  IMU标定: "IMU calibration",
  "RFR 安装": "RFR sensor installation",
  TBOX密钥交换: "TBOX key exchange",
  "TPMS ECU进入自检": "TPMS ECU self-test entry",
  iBooster执行器测试: "iBooster actuator test",
  "一排右座椅自学习（仅低配）": "Row 1 right seat self-learning (base trim)",
  "一排左座椅自学习（仅低配）": "Row 1 left seat self-learning (base trim)",
  "二排右座椅自学习（仅低配）": "Row 2 right seat self-learning (base trim)",
  "二排左座椅自学习（仅低配）": "Row 2 left seat self-learning (base trim)",
  出厂复位: "Factory reset",
  删除钥匙: "Delete keys",
  前视120度摄像头售后标定: "Front 120° camera aftersales calibration",
  前视64度摄像头售后标定: "Front 64° camera aftersales calibration",
  加液排气: "Fluid fill and bleed",
  动态校准: "Dynamic calibration",
  动态测试: "Dynamic test",
  单个扬声器发声测试: "Single speaker output test",
  右侧驻车制动器释放: "Right parking brake release",
  启动擦除内存: "Start memory erase",
  学习钥匙: "Learn keys",
  座椅自学习: "Seat self-learning",
  "座椅自学习（仅高配）": "Seat self-learning (high trim)",
  延迟执行机构控制: "Delayed actuator control",
  扬声器循环发声测试: "Speaker cycle output test",
  抽真空加注: "Vacuum and refill",
  控制器检测: "Controller self-check",
  数据复位A: "Data reset A",
  数据复位B: "Data reset B",
  显示屏幕触摸轨迹和坐标: "Show touch trace and coordinates",
  热管理下线检测: "Thermal management end-of-line check",
  环视摄像头售后标定: "Surround-view camera aftersales calibration",
  空调风门下线检测: "HVAC air damper end-of-line check",
  装配测试: "Assembly test",
  角标自学习: "Corner radar self-learning",
  车窗自学习: "Window self-learning",
  车辆俯仰角和侧倾角标定: "Vehicle pitch and roll angle calibration",
  "轮速限制 禁止/启用": "Wheel speed limit disable / enable",
  进入PBC维修模式: "Enter PBC service mode",
  退出PBC维修模式: "Exit PBC service mode",
  遮阳帘自学习: "Sunshade self-learning",
  "长滑轨自学习（仅高配航空座椅）": "Long rail self-learning (aero seats)",
  阀门继电器关闭禁用: "Valve relay shutdown disable",
  静态校准: "Static calibration",
};

export const routineLabel = (routine: string): string => ROUTINE_LABELS[routine] ?? routine;

/** Routines that physically move a component get the actuator treatment. */
export const isActuatorRoutine = (routine: string): boolean =>
  /(测试|test|控制|释放|发声|加注|排气|风门)/i.test(routine);
