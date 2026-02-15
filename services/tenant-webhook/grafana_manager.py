#!/usr/bin/env python3
# =============================================================================
# Grafana Organization Manager
# =============================================================================
# Service to manage Grafana organizations for multi-tenant isolation

import os
import logging
import requests
from typing import Dict, Any, Optional, List
from requests.auth import HTTPBasicAuth

logger = logging.getLogger(__name__)

class GrafanaOrganizationManager:
    """Manage Grafana organizations for tenant isolation"""
    
    def __init__(self):
        self.grafana_url = os.getenv('GRAFANA_URL', 'http://grafana-service:3000')
        self.grafana_admin_user = os.getenv('GRAFANA_ADMIN_USER', 'admin')
        self.grafana_admin_password = os.getenv('GRAFANA_ADMIN_PASSWORD', '')
        self.auth = HTTPBasicAuth(self.grafana_admin_user, self.grafana_admin_password)
        self.api_url = f"{self.grafana_url}/api"
        
    def create_organization(self, tenant_id: str, tenant_name: str) -> Optional[Dict[str, Any]]:
        """Create a Grafana organization for a tenant"""
        try:
            logger.info(f"Creating Grafana organization for tenant: {tenant_id}")
            
            # Create organization
            org_data = {
                "name": f"Tenant {tenant_name} ({tenant_id})"
            }
            
            response = requests.post(
                f"{self.api_url}/orgs",
                json=org_data,
                auth=self.auth,
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            if response.status_code == 200:
                org = response.json()
                org_id = org['orgId']
                logger.info(f"Created Grafana organization {org_id} for tenant {tenant_id}")
                
                # Update organization name and settings
                update_response = requests.put(
                    f"{self.api_url}/orgs/{org_id}",
                    json={
                        "name": f"Tenant {tenant_name} ({tenant_id})",
                        "address": {
                            "address1": "",
                            "address2": "",
                            "city": "",
                            "zipCode": "",
                            "state": "",
                            "country": ""
                        }
                    },
                    auth=self.auth,
                    headers={'Content-Type': 'application/json'},
                    timeout=10
                )
                
                if update_response.status_code == 200:
                    logger.info(f"Updated organization settings for tenant {tenant_id}")
                
                return {
                    'org_id': org_id,
                    'org_name': org_data['name'],
                    'tenant_id': tenant_id,
                    'success': True
                }
            elif response.status_code == 409:
                # Organization already exists, get it
                logger.info(f"Organization for tenant {tenant_id} already exists, retrieving...")
                org = self.get_organization_by_name(org_data['name'])
                if org:
                    return {
                        'org_id': org['id'],
                        'org_name': org['name'],
                        'tenant_id': tenant_id,
                        'success': True,
                        'existing': True
                    }
                else:
                    logger.warning(f"Could not retrieve existing organization for {tenant_id}")
                    return None
            else:
                logger.error(f"Failed to create Grafana organization: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error creating Grafana organization for {tenant_id}: {e}")
            return None
    
    def get_organization_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Get organization by name"""
        try:
            response = requests.get(
                f"{self.api_url}/orgs/name/{name}",
                auth=self.auth,
                timeout=10
            )
            
            if response.status_code == 200:
                return response.json()
            return None
        except Exception as e:
            logger.error(f"Error getting organization by name {name}: {e}")
            return None
    
    def add_user_to_organization(self, org_id: int, user_email: str, role: str = 'Viewer') -> bool:
        """Add user to Grafana organization with specific role"""
        try:
            logger.info(f"Adding user {user_email} to organization {org_id} with role {role}")
            
            # First, get or create the user in Grafana
            user = self.get_or_create_user(user_email)
            if not user:
                logger.error(f"Could not get or create user {user_email}")
                return False
            
            # Add user to organization
            response = requests.post(
                f"{self.api_url}/orgs/{org_id}/users",
                json={
                    "loginOrEmail": user_email,
                    "role": role  # Admin, Editor, or Viewer
                },
                auth=self.auth,
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info(f"Added user {user_email} to organization {org_id} with role {role}")
                return True
            elif response.status_code == 409:
                # User already in organization, update role
                logger.info(f"User {user_email} already in organization, updating role...")
                return self.update_user_role(org_id, user['id'], role)
            else:
                logger.error(f"Failed to add user to organization: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Error adding user to organization: {e}")
            return False
    
    def get_or_create_user(self, user_email: str) -> Optional[Dict[str, Any]]:
        """Get existing user or create new user in Grafana"""
        try:
            # Try to get user
            response = requests.get(
                f"{self.api_url}/users/lookup?loginOrEmail={user_email}",
                auth=self.auth,
                timeout=10
            )
            
            if response.status_code == 200:
                return response.json()
            
            # User doesn't exist, create it
            logger.info(f"Creating Grafana user: {user_email}")
            create_response = requests.post(
                f"{self.api_url}/admin/users",
                json={
                    "email": user_email,
                    "login": user_email,
                    "name": user_email.split('@')[0]
                },
                auth=self.auth,
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            if create_response.status_code == 200:
                return create_response.json()
            else:
                logger.error(f"Failed to create user: {create_response.status_code} - {create_response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error getting or creating user {user_email}: {e}")
            return None
    
    def update_user_role(self, org_id: int, user_id: int, role: str) -> bool:
        """Update user role in organization"""
        try:
            response = requests.patch(
                f"{self.api_url}/orgs/{org_id}/users/{user_id}",
                json={"role": role},
                auth=self.auth,
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info(f"Updated user {user_id} role to {role} in organization {org_id}")
                return True
            else:
                logger.error(f"Failed to update user role: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Error updating user role: {e}")
            return False
    
    def create_tenant_dashboard(self, org_id: int, tenant_id: str, tenant_name: str) -> bool:
        """Create default dashboard for tenant in their organization"""
        try:
            logger.info(f"Creating dashboard for tenant {tenant_id} in organization {org_id}")
            
            # Switch to the tenant's organization context
            switch_response = requests.post(
                f"{self.api_url}/user/using/{org_id}",
                auth=self.auth,
                timeout=10
            )
            
            if switch_response.status_code != 200:
                logger.warning(f"Could not switch to organization {org_id}")
            
            # Create dashboard JSON
            dashboard_json = {
                "dashboard": {
                    "title": f"Dashboard - {tenant_name}",
                    "tags": ["tenant", tenant_id, "nekazari"],
                    "timezone": "browser",
                    "schemaVersion": 38,
                    "version": 1,
                    "refresh": "30s",
                    "panels": [
                        {
                            "id": 1,
                            "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0},
                            "type": "stat",
                            "title": "Robots Activos",
                            "targets": [
                                {
                                    "expr": f'count(ngsi_entity_status{{tenant_id="{tenant_id}",type="AgriculturalRobot"}})',
                                    "refId": "A"
                                }
                            ],
                            "fieldConfig": {
                                "defaults": {
                                    "color": {"mode": "thresholds"},
                                    "thresholds": {
                                        "mode": "absolute",
                                        "steps": [
                                            {"value": 0, "color": "red"},
                                            {"value": 1, "color": "green"}
                                        ]
                                    }
                                }
                            }
                        },
                        {
                            "id": 2,
                            "gridPos": {"h": 8, "w": 12, "x": 12, "y": 0},
                            "type": "stat",
                            "title": "Sensores Activos",
                            "targets": [
                                {
                                    "expr": f'count(ngsi_entity_status{{tenant_id="{tenant_id}",type="AgriSensor"}})',
                                    "refId": "A"
                                }
                            ],
                            "fieldConfig": {
                                "defaults": {
                                    "color": {"mode": "thresholds"},
                                    "thresholds": {
                                        "mode": "absolute",
                                        "steps": [
                                            {"value": 0, "color": "red"},
                                            {"value": 1, "color": "green"}
                                        ]
                                    }
                                }
                            }
                        }
                    ]
                },
                "overwrite": False,
                "message": f"Initial dashboard for tenant {tenant_id}"
            }
            
            # Create dashboard in tenant's organization
            response = requests.post(
                f"{self.api_url}/dashboards/db",
                json=dashboard_json,
                auth=self.auth,
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info(f"Created dashboard for tenant {tenant_id}")
                return True
            else:
                logger.error(f"Failed to create dashboard: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Error creating dashboard for tenant {tenant_id}: {e}")
            return False
    
    def switch_organization(self, org_id: int) -> bool:
        """Switch to a specific organization context"""
        try:
            response = requests.post(
                f"{self.api_url}/user/using/{org_id}",
                auth=self.auth,
                timeout=10
            )
            return response.status_code == 200
        except Exception as e:
            logger.error(f"Error switching to organization {org_id}: {e}")
            return False
    
    def create_timescaledb_datasource(self, org_id: int, tenant_id: str, timescale_password: str) -> bool:
        """Create TimescaleDB datasource for tenant organization with tenant filtering"""
        try:
            # Switch to tenant organization
            if not self.switch_organization(org_id):
                logger.error(f"Failed to switch to organization {org_id}")
                return False
            
            # Create TimescaleDB datasource
            datasource = {
                "name": "TimescaleDB",
                "type": "postgres",
                "access": "proxy",
                "url": "postgresql-service:5432",
                "database": "nekazari",
                "user": "timescale",
                "secureJsonData": {
                    "password": timescale_password
                },
                "jsonData": {
                    "sslmode": "disable",
                    "postgresVersion": 1500,
                    "timescaledb": True,
                    "maxOpenConns": 100,
                    "maxIdleConns": 100,
                    "connMaxLifetime": 14400
                },
                "isDefault": True,
                "editable": False  # No permitir edición para seguridad
            }
            
            response = requests.post(
                f"{self.api_url}/datasources",
                json=datasource,
                auth=self.auth,
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info(f"Created TimescaleDB datasource for tenant {tenant_id} in org {org_id}")
                return True
            elif response.status_code == 409:
                logger.info(f"TimescaleDB datasource already exists for tenant {tenant_id}")
                return True
            else:
                logger.error(f"Failed to create TimescaleDB datasource: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Error creating TimescaleDB datasource for tenant {tenant_id}: {e}")
            return False
    
    def create_prometheus_datasource(self, org_id: int) -> bool:
        """Create Prometheus datasource (only for PlatformAdmin organization)"""
        try:
            # Switch to organization
            if not self.switch_organization(org_id):
                logger.error(f"Failed to switch to organization {org_id}")
                return False
            
            # Create Prometheus datasource
            datasource = {
                "name": "Prometheus",
                "type": "prometheus",
                "access": "proxy",
                "url": "http://prometheus-service:9090",
                "isDefault": True,
                "editable": True,
                "jsonData": {
                    "timeInterval": "15s",
                    "httpMethod": "POST"
                }
            }
            
            response = requests.post(
                f"{self.api_url}/datasources",
                json=datasource,
                auth=self.auth,
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info(f"Created Prometheus datasource for org {org_id}")
                return True
            elif response.status_code == 409:
                logger.info(f"Prometheus datasource already exists for org {org_id}")
                return True
            else:
                logger.error(f"Failed to create Prometheus datasource: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Error creating Prometheus datasource for org {org_id}: {e}")
            return False
    
    def setup_tenant_grafana(self, tenant_id: str, tenant_name: str, user_email: str, user_role: str = 'Admin') -> Dict[str, Any]:
        """Complete setup for a tenant: organization, datasources, user, and dashboard"""
        result = {
            'tenant_id': tenant_id,
            'organization': None,
            'datasources_created': False,
            'user_added': False,
            'dashboard_created': False,
            'success': False
        }
        
        # Get TimescaleDB password from environment
        timescale_password = os.getenv('TIMESCALE_PASSWORD', '')
        if not timescale_password:
            logger.warning("TIMESCALE_PASSWORD not set, datasource creation may fail")
        
        # Create organization
        org = self.create_organization(tenant_id, tenant_name)
        if not org:
            logger.error(f"Failed to create Grafana organization for {tenant_id}")
            return result
        
        result['organization'] = org
        org_id = org['org_id']
        
        # Create TimescaleDB datasource for tenant (with tenant filtering)
        datasource_created = self.create_timescaledb_datasource(org_id, tenant_id, timescale_password)
        result['datasources_created'] = datasource_created
        
        # Add user to organization
        if user_email:
            user_added = self.add_user_to_organization(org_id, user_email, user_role)
            result['user_added'] = user_added
        
        # Create dashboard
        dashboard_created = self.create_tenant_dashboard(org_id, tenant_id, tenant_name)
        result['dashboard_created'] = dashboard_created
        
        result['success'] = org and datasource_created and (user_added if user_email else True) and dashboard_created
        
        return result
    
    def setup_platform_admin_grafana(self, timescale_password: str) -> Dict[str, Any]:
        """Setup Grafana for PlatformAdmin: organization with Prometheus + TimescaleDB"""
        result = {
            'organization': None,
            'prometheus_created': False,
            'timescaledb_created': False,
            'success': False
        }
        
        # Create or get PlatformAdmin organization
        org = self.create_organization('platform-admin', 'Platform Admin')
        if not org:
            logger.error("Failed to create PlatformAdmin Grafana organization")
            return result
        
        result['organization'] = org
        org_id = org['org_id']
        
        # Create Prometheus datasource (only for PlatformAdmin)
        prometheus_created = self.create_prometheus_datasource(org_id)
        result['prometheus_created'] = prometheus_created
        
        # Create TimescaleDB datasource (full access, no tenant filtering)
        timescaledb_created = self.create_timescaledb_datasource(org_id, 'platform-admin', timescale_password)
        result['timescaledb_created'] = timescaledb_created
        
        result['success'] = prometheus_created and timescaledb_created
        
        return result

