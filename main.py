import flet as ft
import threading
import logging
from improved_backend import MultiPartProxy

# إعدادات التسجيل
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

class AlrufaaeyApp:
    def __init__(self, page: ft.Page):
        self.page = page
        self.proxy_service = None
        self.is_connected = False
        self.setup_ui()

    def setup_ui(self):
        self.page.title = "Alrufaaey Proxy Pro"
        self.page.theme_mode = ft.ThemeMode.DARK
        self.page.padding = 0
        self.page.bgcolor = "#0A0A0A"
        self.page.window_width = 400
        self.page.window_height = 750
        
        # Header / Control Panel
        self.header = ft.Container(
            content=ft.Row(
                [
                    ft.Row([
                        ft.Icon(ft.icons.SHIELD_ROUNDED, color="#00E676", size=28),
                        ft.Text("ALRUFAAEY PROXY", size=18, weight="bold", color="white"),
                    ], spacing=10),
                    ft.IconButton(ft.icons.SETTINGS_OUTLINED, icon_color="white70", icon_size=20),
                ],
                alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
            ),
            padding=ft.padding.only(left=20, right=10, top=15, bottom=15),
            bgcolor="#141414",
            border=ft.border.only(bottom=ft.BorderSide(0.5, "white10")),
        )

        # Stats Cards
        self.speed_stat = self.create_stat_card("Speed", "32 Parts", ft.icons.SPEED, "#2196F3")
        self.port_stat = self.create_stat_card("Local Port", "2323", ft.icons.PORT_OPEN, "#FF9800")
        self.target_stat = self.create_stat_card("Target", "lifetwist.net", ft.icons.DASHBOARD, "#9C27B0")

        # Main Connect Button with Pulse Effect (Visual only)
        self.connect_btn = ft.Container(
            content=ft.Column(
                [
                    ft.Icon(ft.icons.POWER_SETTINGS_NEW, size=60, color="white"),
                    ft.Text("CONNECT", weight="bold", color="white", size=16),
                ],
                alignment=ft.MainAxisAlignment.CENTER,
                horizontal_alignment=ft.CrossAxisAlignment.CENTER,
            ),
            width=180,
            height=180,
            border_radius=90,
            bgcolor="#FF1744",
            on_click=self.toggle_connection,
            animate=ft.animation.Animation(400, ft.AnimationCurve.EASE_OUT),
            shadow=ft.BoxShadow(blur_radius=30, color=ft.colors.with_opacity(0.3, "#FF1744"), spread_radius=5),
        )

        # Custom Header Info Section
        self.header_info = ft.Container(
            content=ft.Column([
                ft.Text("CUSTOM HEADER ACTIVE", size=12, weight="bold", color="#00E676"),
                ft.Text("User-Agent: Android 14 / Chrome 133", size=11, color="white54"),
            ], spacing=2),
            padding=ft.padding.only(left=25, right=25, top=10, bottom=10),
            bgcolor="#1A1A1A",
            border_radius=10,
            margin=ft.margin.only(left=20, right=20, bottom=10),
        )

        # Proxy List Section
        self.proxy_list = ft.ListView(
            expand=True,
            spacing=12,
            padding=20,
        )
        self.add_proxy_item("lifetwist.net:443", "Auto-Forwarding Active", True)
        self.add_proxy_item("Localhost:2323", "Listening for Connections", False)

        # Layout
        self.page.add(
            ft.Column(
                [
                    self.header,
                    ft.Container(
                        content=ft.Row(
                            [self.speed_stat, self.port_stat, self.target_stat],
                            alignment=ft.MainAxisAlignment.CENTER,
                            spacing=12,
                        ),
                        padding=ft.padding.only(top=25, bottom=25),
                    ),
                    self.header_info,
                    ft.Container(
                        content=self.connect_btn,
                        alignment=ft.alignment.center,
                        padding=ft.padding.only(top=20, bottom=40),
                    ),
                    ft.Container(
                        content=ft.Text("NETWORK STATUS", size=13, weight="bold", color="white38", letter_spacing=1.2),
                        padding=ft.padding.only(left=25, bottom=10),
                    ),
                    self.proxy_list,
                ],
                expand=True,
            )
        )

    def create_stat_card(self, title, value, icon, color):
        return ft.Container(
            content=ft.Column(
                [
                    ft.Icon(icon, color=color, size=22),
                    ft.Text(value, size=13, weight="bold", color="white"),
                    ft.Text(title, size=10, color="white38", weight="w500"),
                ],
                alignment=ft.MainAxisAlignment.CENTER,
                horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                spacing=5,
            ),
            bgcolor="#141414",
            padding=12,
            border_radius=15,
            width=110,
            border=ft.border.all(1, "white10"),
        )

    def add_proxy_item(self, host, status, is_active):
        self.proxy_list.controls.append(
            ft.Container(
                content=ft.Row(
                    [
                        ft.Container(
                            content=ft.Icon(ft.icons.DNS_ROUNDED, color="white70" if is_active else "white30", size=20),
                            padding=10,
                            bgcolor="#222222" if is_active else "#1A1A1A",
                            border_radius=10,
                        ),
                        ft.Column(
                            [
                                ft.Text(host, size=14, weight="bold", color="white"),
                                ft.Text(status, size=11, color="white54"),
                            ],
                            spacing=2,
                        ),
                        ft.Spacer(),
                        ft.Container(
                            width=10,
                            height=10,
                            border_radius=5,
                            bgcolor="#00E676" if is_active else "white10",
                        )
                    ]
                ),
                bgcolor="#141414",
                padding=15,
                border_radius=15,
                border=ft.border.all(1, "white10"),
            )
        )

    def toggle_connection(self, e):
        if not self.is_connected:
            self.start_proxy()
        else:
            self.stop_proxy()

    def start_proxy(self):
        self.is_connected = True
        self.connect_btn.bgcolor = "#00E676"
        self.connect_btn.shadow = ft.BoxShadow(blur_radius=40, color=ft.colors.with_opacity(0.4, "#00E676"), spread_radius=8)
        self.connect_btn.content.controls[1].value = "DISCONNECT"
        
        # تشغيل البروكسي مع الإعدادات المطلوبة
        self.proxy_service = MultiPartProxy(local_port=2323, remote_host='lifetwist.net', remote_port=443, parts=32)
        threading.Thread(target=self.proxy_service.start, daemon=True).start()
        
        self.page.update()
        self.show_snack("Proxy Engine Started with Custom Headers")

    def stop_proxy(self):
        self.is_connected = False
        self.connect_btn.bgcolor = "#FF1744"
        self.connect_btn.shadow = ft.BoxShadow(blur_radius=30, color=ft.colors.with_opacity(0.3, "#FF1744"), spread_radius=5)
        self.connect_btn.content.controls[1].value = "CONNECT"
        
        if self.proxy_service:
            self.proxy_service.stop()
            
        self.page.update()
        self.show_snack("Proxy Service Terminated")

    def show_snack(self, message):
        self.page.snack_bar = ft.SnackBar(
            content=ft.Text(message, color="white"),
            bgcolor="#1E1E1E",
            behavior=ft.SnackBarBehavior.FLOATING,
            margin=20,
        )
        self.page.snack_bar.open = True
        self.page.update()

def main(page: ft.Page):
    AlrufaaeyApp(page)

if __name__ == "__main__":
    ft.app(target=main)
