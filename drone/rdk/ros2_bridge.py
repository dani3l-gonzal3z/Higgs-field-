"""Opcional: el dron de Plató dentro de ROS 2 (TogetherROS en la RDK X5, o ROS 2 Humble en cualquier placa).

    python3 plato_bridge.py --ros2

Publica
  /plato/camara/izquierda/compressed   sensor_msgs/CompressedImage (JPEG)
  /plato/camara/derecha/compressed     sensor_msgs/CompressedImage (JPEG)
  /plato/odom                          nav_msgs/Odometry (ENU, marco 'map')
Escucha
  /cmd_vel                             geometry_msgs/Twist  (marco del dron: x adelante, y izquierda, z arriba; angular.z = giro)
  /plato/orden                         std_msgs/String      (las mismas órdenes en castellano: «sigue ese pájaro»)

Mientras lleguen /cmd_vel manda ROS (tus nodos: hobot_dnn, nav2…); si dejan de llegar 1 s, vuelve a mandar mision.py.
"""
import math, time
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import CompressedImage
from nav_msgs.msg import Odometry
from geometry_msgs.msg import Twist
from std_msgs.msg import String


class Ros2Bridge:
    def __init__(self, mision):
        if not rclpy.ok(): rclpy.init()
        self.m = mision; self.n = Node('plato_dron'); self.last_cmd = 0
        self.pub_l = self.n.create_publisher(CompressedImage, '/plato/camara/izquierda/compressed', 5)
        self.pub_r = self.n.create_publisher(CompressedImage, '/plato/camara/derecha/compressed', 5)
        self.pub_o = self.n.create_publisher(Odometry, '/plato/odom', 10)
        self.n.create_subscription(Twist, '/cmd_vel', self.on_twist, 10)
        self.n.create_subscription(String, '/plato/orden', lambda s: self.m.order(s.data), 10)
        orig = self.m.tick
        def tick():  # con /cmd_vel recientes, ROS manda y la misión calla (salvo sus avisos)
            out = orig()
            if time.time() - self.last_cmd < 1.0: out = [o for o in out if not (isinstance(o, dict) and o.get('t') == 'cmd')] + self.pending; self.pending = []
            return out
        self.pending = []; self.m.tick = tick

    def on_twist(self, t):
        self.last_cmd = time.time()
        self.pending = [{'t': 'cmd', 'frame': 'body', 'vx': t.linear.x, 'vy': t.linear.y, 'vz': t.linear.z, 'yaw_rate': t.angular.z}]

    def on(self, msg):
        if msg.get('t') != 'telem': return
        o = Odometry(); o.header.stamp = self.n.get_clock().now().to_msg(); o.header.frame_id = 'map'; o.child_frame_id = 'dron'
        o.pose.pose.position.x, o.pose.pose.position.y, o.pose.pose.position.z = msg['pos']
        o.pose.pose.orientation.z, o.pose.pose.orientation.w = math.sin(msg['yaw'] / 2), math.cos(msg['yaw'] / 2)
        o.twist.twist.linear.x, o.twist.twist.linear.y, o.twist.twist.linear.z = msg['vel']
        self.pub_o.publish(o)

    def on_frame(self, kind, jpeg):
        c = CompressedImage(); c.header.stamp = self.n.get_clock().now().to_msg(); c.header.frame_id = 'camara_' + ('izquierda' if kind == 1 else 'derecha'); c.format = 'jpeg'; c.data = jpeg
        (self.pub_l if kind == 1 else self.pub_r).publish(c)

    def spin_once(self):
        rclpy.spin_once(self.n, timeout_sec=0)
